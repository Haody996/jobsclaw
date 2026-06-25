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
import { resolveApplyUrls, ResolveQuotaExhausted } from '../lib/resolve-apply-url'
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

// LinkedIn → direct ATS URL resolution lives in ../lib/resolve-apply-url
// (shared with the sourcing worker, which stamps each match with a URL).

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
    const resp = await page.goto(job.url, { waitUntil: 'domcontentloaded', timeout: 30000 })
    await page.waitForTimeout(1500)
    const blocked = await pageBlockedReason(page, resp ? resp.status() : null)
    if (blocked) throw new Error(blocked)

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

// Inspect a freshly-navigated page for bot protection or a dead listing.
// Returns a human-readable reason if the page is unusable, else null.
async function pageBlockedReason(page: any, status: number | null): Promise<string | null> {
  if (status != null && status >= 400) {
    return `apply page returned HTTP ${status} — the job posting was likely removed or expired`
  }
  const title = ((await page.title().catch(() => '')) || '').trim()
  const body = ((await page.locator('body').innerText({ timeout: 3000 }).catch(() => '')) || '').slice(0, 2500)
  const hay = `${title}\n${body}`.toLowerCase()
  if (/just a moment|verify you are human|attention required|enable javascript and cookies|cf-browser-verification|are you a robot|checking your browser/i.test(hay)) {
    return `apply page blocked by bot protection (Cloudflare/captcha): "${title}"`
  }
  if (/(page|job|position|posting).{0,24}(not found|no longer (available|exists|open)|has expired|has been removed|been filled|is closed)/i.test(hay)) {
    return `apply page is gone or expired: "${title}"`
  }
  return null
}

// Attempt to apply against one resolved URL. Throws on any failure so the
// caller can fall through to the next candidate.
async function attemptApply(
  url: string,
  job: { id: string; title: string; company: string; description: string },
  profile: ApplyContext['profile'],
  answers: ApplyContext['answers'],
  email: string,
  browser: Browser,
  applicationId: string
): Promise<void> {
  if (detectATS(url) === 'indeed') {
    await runIndeedApply({ ...job, url }, profile, answers, email, browser)
    return
  }

  const context = await browser.newContext()
  const page = await context.newPage()
  try {
    let workingUrl = url
    const resp = await page.goto(workingUrl, { waitUntil: 'domcontentloaded', timeout: 30000 })
    await page.waitForTimeout(2000)
    const blocked = await pageBlockedReason(page, resp ? resp.status() : null)
    if (blocked) throw new Error(blocked)

    // Aggregator unwrap: Built In and similar list-and-link sites embed the
    // real ATS URL in an Apply-Now anchor. Follow it before invoking an adapter.
    if (/builtin\.com|wellfound\.com|otta\.com|welcometothejungle\.com/.test(workingUrl)) {
      const href = await page
        .locator('a[aria-label*="Apply" i][href^="http"]')
        .first()
        .getAttribute('href')
        .catch(() => null)
      if (href && !href.includes('builtin.com') && !/\/auth\/|\/login/.test(href)) {
        dbg('aggregator', `unwrapped ${workingUrl} → ${href}`)
        workingUrl = href
        const r2 = await page.goto(workingUrl, { waitUntil: 'domcontentloaded', timeout: 30000 })
        await page.waitForTimeout(2000)
        const b2 = await pageBlockedReason(page, r2 ? r2.status() : null)
        if (b2) throw new Error(b2)
      } else {
        dbg('aggregator', `no external apply link found on aggregator page (href=${href ?? 'null'})`)
      }
    }

    const adapter = getAdapter(workingUrl)
    dbg('adapter', `using ${adapter.name} for ${workingUrl}`)
    await adapter.apply({ page, job: { ...job, url: workingUrl }, profile, email, answers })
  } catch (err) {
    await captureFailure(page, applicationId, 'attempt').catch(() => null)
    throw err
  } finally {
    await context.close().catch(() => null)
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
    // external apply URL behind a sign-in wall. The sourcing worker already
    // resolves and stamps a real apply URL onto each match (job.applyUrl);
    // use it first, then fall back to a live jsearch lookup for more
    // candidates. The worker tries each in ranked order.
    let candidateUrls: string[]
    if (ats === 'linkedin') {
      candidateUrls = []
      if (job.applyUrl && !job.applyUrl.includes('linkedin.com')) {
        dbg('linkedin', `using pre-resolved applyUrl from match: ${job.applyUrl}`)
        candidateUrls.push(job.applyUrl)
      }
      dbg('linkedin', `live jsearch lookup for "${job.title}" @ "${job.company}"`)
      try {
        const live = await resolveApplyUrls(job.title, job.company, job.location)
        for (const u of live) {
          if (!candidateUrls.includes(u)) candidateUrls.push(u)
        }
      } catch (err: any) {
        if (err instanceof ResolveQuotaExhausted) {
          // Live resolution unavailable. If we have a pre-resolved URL we can
          // still try it; otherwise we have to fail with a clear quota message.
          if (candidateUrls.length === 0) {
            throw new Error(`Auto Apply URL lookup is temporarily unavailable (jsearch quota exhausted). Please apply to "${job.title}" at ${job.company} manually via the LinkedIn link, or try again after the API quota resets.`)
          }
          dbg('linkedin', `jsearch quota exhausted; falling back to ${candidateUrls.length} pre-resolved URL(s)`)
        } else {
          throw err
        }
      }
      if (candidateUrls.length === 0) {
        throw new Error(`Could not resolve a direct apply URL for "${job.title}" at ${job.company}. LinkedIn hides the external URL behind a login wall and jsearch returned no usable non-LinkedIn link — please apply manually.`)
      }
      dbg('linkedin', `${candidateUrls.length} candidate URL(s) to try`)
    } else {
      candidateUrls = [job.applyUrl || job.url]
    }

    browser = await launchBrowser()

    const maxTries = Math.min(candidateUrls.length, 4)
    let applied = false
    let lastErr: Error | null = null
    for (let i = 0; i < maxTries; i++) {
      const url = candidateUrls[i]
      try {
        dbg('attempt', `candidate ${i + 1}/${maxTries}: ${url}`)
        await attemptApply(url, job, profile as ApplyContext['profile'], answers, user.email, browser, applicationId)
        applied = true
        break
      } catch (err: any) {
        lastErr = err
        dbg('attempt', `candidate ${i + 1} failed: ${err?.message || err}`)
      }
    }
    if (!applied) throw lastErr ?? new Error('All apply candidates failed')

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
