import 'dotenv/config'
import fs from 'fs'
import path from 'path'
import { Worker } from 'bullmq'
import { chromium as chromiumExtra } from 'playwright-extra'
import stealth from 'puppeteer-extra-plugin-stealth'
import type { Browser } from 'playwright'
import { connection } from '../lib/queue'
import prisma from '../lib/prisma'
import { detectATS } from '../lib/ats/detect'
import { greenhouseAdapter } from '../lib/ats/greenhouse'
import { leverAdapter } from '../lib/ats/lever'
import { ashbyAdapter } from '../lib/ats/ashby'
import { workdayAdapter } from '../lib/ats/workday'
import { icimsAdapter } from '../lib/ats/icims'
import { genericAdapter } from '../lib/ats/generic'
import { fillCustomQuestionsWithLLM } from '../lib/ats/llm-fill'
import { searchJobs } from '../lib/jsearch'
import type { ATSAdapter, ApplyContext } from '../lib/ats/types'

chromiumExtra.use(stealth())

const FAILURE_DIR = '/tmp/apply-failures'

const ATS_ADAPTERS: ATSAdapter[] = [
  greenhouseAdapter,
  leverAdapter,
  ashbyAdapter,
  workdayAdapter,
  icimsAdapter,
]

function getAdapter(url: string): ATSAdapter {
  return ATS_ADAPTERS.find((a) => a.canHandle(url)) ?? genericAdapter
}

interface ApplyJobData {
  applicationId: string
  jobId: string
  userId: string
}

async function launchBrowser(): Promise<Browser> {
  return chromiumExtra.launch({
    headless: true,
    args: ['--disable-blink-features=AutomationControlled'],
  })
}

// ─── LinkedIn → direct ATS URL resolver ──────────────────────────────────
// LinkedIn hides the external apply URL from logged-out scrapers (the
// "Apply on company site" button just opens a sign-in modal). We resolve
// the job to its real ATS URL via jsearch (a 3rd-party job API that
// aggregates listings across LinkedIn/Indeed/ZipRecruiter/etc. and exposes
// the direct apply link). Returns null if no matching non-LinkedIn URL
// can be found.

function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

// Strip trailing legal-entity suffixes so "Parsec Automation, LLC" and
// "Parsec Automation Corp." normalize to the same thing.
const LEGAL_SUFFIXES = [
  'llc', 'inc', 'incorporated', 'corp', 'corporation', 'ltd', 'limited',
  'co', 'company', 'lp', 'llp', 'plc', 'gmbh', 'ag', 'sa', 'srl', 'bv', 'pllc', 'pc',
]
function normalizeCompany(s: string): string {
  let n = normalize(s)
  let changed = true
  while (changed) {
    changed = false
    for (const suf of LEGAL_SUFFIXES) {
      if (n.endsWith(' ' + suf)) {
        n = n.slice(0, -(suf.length + 1)).trim()
        changed = true
      }
    }
  }
  return n
}

// Sites we cannot get past without a real session (Cloudflare/captcha/login).
// We exclude them as candidate apply URLs unless nothing else is available.
const BOT_PROTECTED_HOSTS = ['ziprecruiter.com', 'glassdoor.com', 'monster.com', 'simplyhired.com']

// Known ATS hosts our adapters can actually fill. Higher priority.
const DIRECT_ATS_HOSTS = ['greenhouse.io', 'boards.greenhouse', 'lever.co', 'ashbyhq.com', 'myworkdayjobs.com', 'icims.com']

function urlScore(link: string): number {
  if (!link) return -100
  if (link.includes('linkedin.com')) return -100
  if (DIRECT_ATS_HOSTS.some((h) => link.includes(h))) return 100
  if (BOT_PROTECTED_HOSTS.some((h) => link.includes(h))) return -50
  return 10 // unknown host, prefer over bot-protected but below ATS
}

async function resolveDirectApplyUrl(
  title: string,
  company: string,
  location?: string | null
): Promise<string | null> {
  const queries = [
    `${title} at ${company}${location ? ' ' + location : ''}`,
    `${title} ${company}`,
    `"${company}" "${title}"`,
  ]

  const wantTitle = normalize(title)
  const wantCompany = normalizeCompany(company)

  type Candidate = { link: string; publisher: string; isDirect: boolean; matchScore: number }
  const seen = new Set<string>()
  const candidates: Candidate[] = []

  for (const q of queries) {
    let results: Awaited<ReturnType<typeof searchJobs>> = []
    try {
      results = await searchJobs({ q, num_pages: 1 })
    } catch (err: any) {
      console.error('[apply:jsearch] query failed:', q, '→', err?.message || err)
      continue
    }
    dbg('jsearch', `query="${q}" → ${results.length} results`)

    for (const j of results) {
      const t = normalize(j.job_title)
      const c = normalizeCompany(j.employer_name)
      const titleMatch = t === wantTitle ? 2 : (t.includes(wantTitle) || wantTitle.includes(t) ? 1 : 0)
      const companyMatch = c === wantCompany ? 2 : (c.includes(wantCompany) || wantCompany.includes(c) ? 1 : 0)
      if (companyMatch === 0 || titleMatch === 0) continue
      const matchScore = titleMatch + companyMatch

      const opts: { link: string; publisher: string; isDirect: boolean }[] = []
      if (j.apply_options && j.apply_options.length) {
        for (const o of j.apply_options) opts.push({ link: o.apply_link, publisher: o.publisher, isDirect: !!o.is_direct })
      } else if (j.job_apply_link) {
        opts.push({ link: j.job_apply_link, publisher: j.job_publisher || '?', isDirect: !!j.job_apply_is_direct })
      }
      for (const o of opts) {
        if (!o.link || seen.has(o.link)) continue
        seen.add(o.link)
        candidates.push({ ...o, matchScore })
      }
    }
  }

  if (candidates.length === 0) return null

  const ranked = candidates
    .map((c) => ({ ...c, total: urlScore(c.link) + (c.isDirect ? 50 : 0) + c.matchScore * 5 }))
    .sort((a, b) => b.total - a.total)

  dbg('jsearch', `${ranked.length} candidate(s) — top 3:`,
    ranked.slice(0, 3).map((c) => `[${c.total}] ${c.publisher}${c.isDirect ? '*' : ''} ${c.link.slice(0, 80)}`).join(' | '))

  const best = ranked[0]
  if (best.total < 0) {
    dbg('jsearch', `best candidate is bot-protected or LinkedIn (score=${best.total}) — bailing`)
    return null
  }
  return best.link
}

// ─── Indeed (may redirect to company ATS) ────────────────────────────────

async function runIndeedApply(
  job: { id: string; url: string; title: string; company: string },
  profile: ApplyContext['profile'],
  answers: ApplyContext['answers'],
  email: string,
  browser: Browser
): Promise<void> {
  const context = await browser.newContext()
  const page = await context.newPage()
  try {
    await page.goto(job.url, { waitUntil: 'domcontentloaded', timeout: 30000 })

    const applyBtnSelectors = [
      '[data-testid="applyButton"]',
      '[data-testid="indeedApplyButton"]',
      '#indeedApplyButton',
      'button:has-text("Apply on company site")',
      'a:has-text("Apply on company site")',
      'button:has-text("Apply now")',
    ]
    let clicked = false
    for (const sel of applyBtnSelectors) {
      try {
        const loc = page.locator(sel).first()
        if (await loc.isVisible({ timeout: 2000 }).catch(() => false)) {
          await Promise.all([
            page.waitForNavigation({ timeout: 8000, waitUntil: 'domcontentloaded' }).catch(() => null),
            loc.click({ timeout: 5000 }),
          ])
          clicked = true
          break
        }
      } catch { /* try next */ }
    }
    if (!clicked) throw new Error('Could not find Indeed apply button')

    await page.waitForTimeout(2000)
    const landedUrl: string = page.url()

    if (!landedUrl.includes('indeed.com')) {
      const adapter = getAdapter(landedUrl)
      await adapter.apply({
        page,
        job: { id: job.id, url: landedUrl, title: job.title, company: job.company },
        profile,
        email,
        answers,
      })
    } else {
      await handleIndeedEasyApply(page, profile, answers, email)
    }
  } catch (err) {
    await captureFailure(page, job.id, 'indeed').catch(() => null)
    throw err
  } finally {
    await context.close().catch(() => null)
  }
}

async function handleIndeedEasyApply(
  page: any,
  profile: ApplyContext['profile'],
  answers: ApplyContext['answers'],
  email: string
): Promise<void> {
  for (let step = 0; step < 8; step++) {
    await page.waitForTimeout(1500)

    const fields: [string, string][] = [
      ['[data-testid="ia-FirstName-input"]', profile.firstName || ''],
      ['[data-testid="ia-LastName-input"]', profile.lastName || ''],
      ['[data-testid="ia-EmailAddress-input"]', email],
      ['[data-testid="ia-PhoneNumber-input"]', profile.phone || ''],
      ['[data-testid="ia-City-input"]', profile.city || ''],
    ]
    for (const [sel, value] of fields) {
      if (!value) continue
      try { const i = await page.$(sel); if (i) { await i.fill(''); await i.fill(value) } } catch { /* ok */ }
    }

    if (profile.resumePath) {
      try { const fi = await page.$('input[type="file"]'); if (fi) await fi.setInputFiles(profile.resumePath) } catch { /* ok */ }
    }

    await fillCustomQuestionsWithLLM(page, profile, email, answers).catch((err) => {
      console.warn('[apply:llm-fill-error]', err?.message || err)
    })

    for (const sel of ['button[data-testid="ia-SubmitButton"]', 'button:has-text("Submit your application")']) {
      if (await tryClick(page, sel)) { await page.waitForTimeout(3000); return }
    }
    let advanced = false
    for (const sel of ['button[data-testid="ia-continueButton"]', 'button:has-text("Continue")', 'button:has-text("Next")']) {
      if (await tryClick(page, sel)) { advanced = true; break }
    }
    if (!advanced) throw new Error('Could not advance Indeed Easy Apply form')
  }
  throw new Error('Indeed Easy Apply exceeded maximum steps')
}

async function tryClick(page: any, sel: string): Promise<boolean> {
  try {
    const loc = page.locator(sel).first()
    if (await loc.isVisible({ timeout: 2000 }).catch(() => false)) {
      await loc.click({ timeout: 5000 })
      return true
    }
  } catch { /* skip */ }
  return false
}

// ─── Debug + failure-capture helpers ─────────────────────────────────────

function dbg(tag: string, ...args: any[]) {
  console.log(`[apply:${tag}]`, ...args)
}

async function captureFailure(page: any, applicationId: string, tag: string): Promise<void> {
  if (!fs.existsSync(FAILURE_DIR)) fs.mkdirSync(FAILURE_DIR, { recursive: true })
  const ts = new Date().toISOString().replace(/[:.]/g, '-')
  const base = path.join(FAILURE_DIR, `${applicationId}-${ts}`)
  try {
    const url = page.url?.() ?? '(no page)'
    const title = await page.title?.().catch(() => '') ?? ''
    console.error(`[apply:fail] ${tag} applicationId=${applicationId} url=${url} title="${title}"`)
    await page.screenshot({ path: `${base}.png`, fullPage: true })
    const html = await page.content?.().catch(() => '')
    if (html) fs.writeFileSync(`${base}.html`, html)
    console.error(`[apply:fail] artifacts saved: ${base}.png, ${base}.html`)
  } catch (capErr: any) {
    console.error(`[apply:fail] could not capture artifacts: ${capErr?.message || capErr}`)
  }
}

// ─── Main orchestrator ────────────────────────────────────────────────────

async function runApply(data: ApplyJobData): Promise<void> {
  const { applicationId, jobId, userId } = data
  dbg('start', `applicationId=${applicationId} jobId=${jobId} userId=${userId}`)

  await prisma.application.update({ where: { id: applicationId }, data: { status: 'IN_PROGRESS' } })

  const [job, profile, user, answers] = await Promise.all([
    prisma.job.findUnique({ where: { id: jobId } }),
    prisma.profile.findUnique({ where: { userId } }),
    prisma.user.findUnique({ where: { id: userId }, select: { email: true } }),
    prisma.commonAnswer.findMany({ where: { userId } }),
  ])

  dbg('data', `job=${job?.title ?? 'NOT FOUND'} profile=${profile ? 'ok' : 'MISSING'} user=${user?.email ?? 'MISSING'} answers=${answers.length}`)

  if (!job || !profile || !user) {
    dbg('abort', 'missing job/profile/user — failing application')
    await prisma.application.update({
      where: { id: applicationId },
      data: { status: 'FAILED', errorMessage: 'Missing profile data' },
    })
    return
  }

  dbg('profile-check',
    `firstName=${profile.firstName || '(empty)'}`,
    `lastName=${profile.lastName || '(empty)'}`,
    `phone=${profile.phone || '(none)'}`,
    `resumePath=${profile.resumePath || '(none)'}`,
    `resumeText=${profile.resumeText ? profile.resumeText.length + ' chars' : '(none)'}`,
  )

  const ats = detectATS(job.url)
  dbg('ats', `${job.title} @ ${job.company} → ${ats} isEasyApply=${job.isEasyApply}`, `url=${job.url}`)

  let browser: Browser | null = null
  try {
    if (ats === 'linkedin' && job.isEasyApply) {
      throw new Error('LinkedIn Easy Apply must be done manually — open the job on LinkedIn and submit there.')
    }

    // For non-Easy-Apply LinkedIn jobs, LinkedIn's public job page hides the
    // external apply URL behind a sign-in wall. Resolve it via jsearch first.
    let workingUrl = job.url
    let effectiveAts = ats
    if (ats === 'linkedin') {
      dbg('linkedin', `looking up direct apply URL via jsearch for "${job.title}" @ "${job.company}"`)
      const directUrl = await resolveDirectApplyUrl(job.title, job.company, job.location)
      if (!directUrl) {
        throw new Error(`Could not resolve a direct apply URL for "${job.title}" at ${job.company}. The LinkedIn page requires login to reveal the external URL, and jsearch didn't return a matching non-LinkedIn link.`)
      }
      workingUrl = directUrl
      effectiveAts = detectATS(workingUrl)
      dbg('linkedin', `resolved → ats=${effectiveAts} url=${workingUrl}`)
    }

    browser = await launchBrowser()

    if (effectiveAts === 'indeed') {
      await runIndeedApply({ ...job, url: workingUrl }, profile as ApplyContext['profile'], answers, user.email, browser)
    } else {
      const context = await browser.newContext()
      const page = await context.newPage()
      try {
        // Pre-flight: navigate and check for a bot-protection challenge so we
        // fail with a clear message instead of "could not find submit button".
        await page.goto(workingUrl, { waitUntil: 'domcontentloaded', timeout: 30000 })
        await page.waitForTimeout(2000)
        const t = (await page.title().catch(() => '')) || ''
        const txt = (await page.locator('body').innerText({ timeout: 3000 }).catch(() => '')).slice(0, 2000)
        if (/just a moment|verify you are human|attention required|access denied|are you human/i.test(t + ' ' + txt)) {
          throw new Error(`Apply page blocked by bot protection (Cloudflare/captcha): "${t.trim()}" at ${workingUrl}`)
        }

        // Aggregator unwrap: Built In and similar list-and-link sites embed
        // the real ATS URL in an Apply-Now anchor. Follow it before handing
        // off to the adapter.
        if (/builtin\.com|wellfound\.com|otta\.com|welcometothejungle\.com/.test(workingUrl)) {
          const href = await page
            .locator('a[aria-label*="Apply" i][href^="http"]')
            .first()
            .getAttribute('href')
            .catch(() => null)
          if (href && !href.includes('builtin.com') && !/\/auth\/|\/login/.test(href)) {
            dbg('aggregator', `unwrapped ${workingUrl} → ${href}`)
            workingUrl = href
            effectiveAts = detectATS(workingUrl)
            await page.goto(workingUrl, { waitUntil: 'domcontentloaded', timeout: 30000 })
            await page.waitForTimeout(2000)
          } else {
            dbg('aggregator', `no external apply link found on aggregator page (got href=${href ?? 'null'})`)
          }
        }

        const adapter = getAdapter(workingUrl)
        dbg('adapter', `using ${adapter.name} for ${workingUrl}`)

        await adapter.apply({
          page,
          job: { ...job, url: workingUrl },
          profile: profile as ApplyContext['profile'],
          email: user.email,
          answers,
        })
      } catch (err) {
        await captureFailure(page, applicationId, `adapter`).catch(() => null)
        throw err
      } finally {
        await context.close().catch(() => null)
      }
    }

    await prisma.application.update({ where: { id: applicationId }, data: { status: 'SUBMITTED' } })
    dbg('done', `✓ Applied: ${job.title} @ ${job.company} [${ats}] (${applicationId})`)
  } catch (err: any) {
    const msg = err.message || 'Unknown error'
    console.error(`[apply:error] applicationId=${applicationId} ats=${ats} jobUrl=${job.url}`)
    console.error(`[apply:error] message=${msg}`)
    if (err.stack) console.error(`[apply:error] stack=${err.stack}`)
    await prisma.application.update({
      where: { id: applicationId },
      data: { status: 'FAILED', errorMessage: msg },
    })
  } finally {
    if (browser) await browser.close().catch(() => null)
  }
}

// ─── Worker ───────────────────────────────────────────────────────────────

const worker = new Worker<ApplyJobData>(
  'apply-jobs',
  async (job) => {
    console.log(`Processing application ${job.data.applicationId}`)
    await runApply(job.data)
  },
  { connection, concurrency: 1 }
)

worker.on('completed', (job) => console.log(`Job ${job.id} completed`))
worker.on('failed', (job, err) => console.error(`Job ${job?.id} failed: ${err.message}`))

console.log('Apply worker started, waiting for jobs…')
