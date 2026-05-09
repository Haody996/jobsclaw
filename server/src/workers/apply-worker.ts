import 'dotenv/config'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { Worker } from 'bullmq'
import { chromium } from 'playwright'
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
import type { ATSAdapter, ApplyContext } from '../lib/ats/types'

const LINKEDIN_STATE_PATH = path.join(os.homedir(), '.config', 'autoapply', 'linkedin-state.json')

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

// ─── LinkedIn Easy Apply ──────────────────────────────────────────────────

async function loginLinkedIn(page: any, liEmail: string, liPassword: string): Promise<void> {
  dbg('linkedin', `logging in as ${liEmail}`)
  await page.goto('https://www.linkedin.com/login', { waitUntil: 'domcontentloaded', timeout: 30000 })
  await page.waitForTimeout(1500)
  await page.fill('#username', liEmail)
  await page.fill('#password', liPassword)
  await page.click('button[type="submit"]')
  await page.waitForTimeout(5000)

  const url: string = page.url()
  if (url.includes('/checkpoint/') || url.includes('/challenge/') || url.includes('/authwall')) {
    throw new Error('LinkedIn requires CAPTCHA or 2FA — resolve the checkpoint then retry.')
  }
  if (url.includes('/login')) {
    throw new Error('LinkedIn login failed — check your LinkedIn email and password in Profile settings.')
  }
}

async function handleEasyApplyStep(
  page: any,
  profile: ApplyContext['profile'],
  answers: ApplyContext['answers'],
  email: string
): Promise<boolean> {
  await page.waitForTimeout(1500)

  const modal = page
    .locator('[role="dialog"], .jobs-easy-apply-modal, [data-test-modal], [class*="easy-apply"]')
    .first()

  const fieldMap: [string, string][] = [
    ['input[id*="first-name"], input[name="firstName"]', profile.firstName || ''],
    ['input[id*="last-name"], input[name="lastName"]', profile.lastName || ''],
    ['input[id*="phoneNumber"], input[id*="phone"]', profile.phone || ''],
    ['input[id*="city"]', profile.city || ''],
  ]
  for (const [sel, value] of fieldMap) {
    if (!value) continue
    try {
      const loc = modal.locator(sel).first()
      if (await loc.isVisible({ timeout: 1000 }).catch(() => false)) {
        const current = await loc.inputValue().catch(() => '')
        if (!current) await loc.fill(value)
      }
    } catch { /* skip */ }
  }

  if (profile.resumePath) {
    try {
      const fileInput = modal.locator('input[type="file"]').first()
      if (await fileInput.isVisible({ timeout: 1000 }).catch(() => false)) {
        await fileInput.setInputFiles(profile.resumePath)
        await page.waitForTimeout(1000)
      }
    } catch { /* no file input on this step */ }
  }

  // Dropdowns
  try {
    const selects = await modal.locator('select').all()
    for (const select of selects) {
      if (!await select.isVisible({ timeout: 500 }).catch(() => false)) continue
      const options: string[] = await select.locator('option').allInnerTexts()
      const labelText = await select.locator('xpath=../..').locator('label').first().innerText().catch(() => '')

      let matched = false
      for (const qa of answers) {
        if (labelText.toLowerCase().includes(qa.question.toLowerCase().substring(0, 20))) {
          const matchOpt = options.find((o) => o.toLowerCase().includes(qa.answer.toLowerCase()))
          if (matchOpt) { await select.selectOption({ label: matchOpt.trim() }); matched = true; break }
        }
      }
      if (!matched) {
        const yesOpt = options.find((o) => /^yes$/i.test(o.trim()))
        if (yesOpt) await select.selectOption({ label: yesOpt.trim() })
      }
    }
  } catch { /* ok */ }

  // LLM for custom questions inside the modal
  await fillCustomQuestionsWithLLM(modal, profile, email, answers).catch(() => null)

  // Radio buttons — check first option for unanswered groups
  try {
    const fieldsets = await modal.locator('fieldset').all()
    for (const fieldset of fieldsets) {
      const radios = await fieldset.locator('input[type="radio"]').all()
      if (!radios.length) continue
      let anyChecked = false
      for (const r of radios) {
        if (await r.isChecked().catch(() => false)) { anyChecked = true; break }
      }
      if (!anyChecked && radios[0]) await radios[0].check({ timeout: 2000 }).catch(() => null)
    }
  } catch { /* ok */ }

  const footerBtns = modal.locator('footer button, [class*="footer"] button, [class*="action"] button, button')

  for (const txt of ['Submit application', 'Submit your application', 'Submit']) {
    const btn = footerBtns.filter({ hasText: new RegExp(txt, 'i') }).first()
    if (await btn.isVisible({ timeout: 1000 }).catch(() => false)) {
      await btn.click({ timeout: 5000 })
      await page.waitForTimeout(3000)
      return true
    }
  }

  for (const txt of ['Review', 'Next', 'Continue']) {
    const btn = footerBtns.filter({ hasText: new RegExp(`^${txt}`, 'i') }).first()
    if (await btn.isVisible({ timeout: 1000 }).catch(() => false)) {
      await btn.click({ timeout: 5000 })
      return false
    }
  }

  const fallback = page.locator('button').filter({ hasText: /submit|next|review|continue/i }).first()
  if (await fallback.isVisible({ timeout: 1000 }).catch(() => false)) {
    const label: string = await fallback.innerText()
    await fallback.click({ timeout: 5000 })
    if (/submit/i.test(label)) { await page.waitForTimeout(3000); return true }
    return false
  }

  throw new Error('Could not find Next/Submit button in LinkedIn Easy Apply modal')
}

async function runLinkedInApply(
  job: { url: string; title: string; company: string },
  profile: ApplyContext['profile'] & { linkedinEmail?: string | null; linkedinPassword?: string | null },
  answers: ApplyContext['answers'],
  email: string
): Promise<void> {
  const configDir = path.join(os.homedir(), '.config', 'autoapply')
  if (!fs.existsSync(configDir)) fs.mkdirSync(configDir, { recursive: true })

  const stateExists = fs.existsSync(LINKEDIN_STATE_PATH)
  dbg('linkedin', `session file ${stateExists ? 'found' : 'not found'}: ${LINKEDIN_STATE_PATH}`)

  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext(stateExists ? { storageState: LINKEDIN_STATE_PATH } : {})
  const page = await context.newPage()

  try {
    // Navigate to feed to check login state; a redirect loop means the saved
    // session is stale — clear it and re-authenticate on the next run.
    dbg('linkedin', 'checking session via /feed…')
    try {
      await page.goto('https://www.linkedin.com/feed/', { waitUntil: 'domcontentloaded', timeout: 30000 })
    } catch (navErr: any) {
      if (/ERR_TOO_MANY_REDIRECTS/i.test(navErr.message)) {
        if (fs.existsSync(LINKEDIN_STATE_PATH)) fs.unlinkSync(LINKEDIN_STATE_PATH)
        throw new Error('LinkedIn session expired and caused a redirect loop. The stale session has been cleared — please retry to re-authenticate.')
      }
      throw navErr
    }
    await page.waitForTimeout(2000)
    const feedUrl = page.url()
    const isLoggedIn = !feedUrl.includes('/login') && !feedUrl.includes('/authwall')
    dbg('linkedin', `session check — landed on: ${feedUrl} → loggedIn=${isLoggedIn}`)

    if (!isLoggedIn) {
      if (!profile.linkedinEmail || !profile.linkedinPassword) {
        throw new Error('LinkedIn credentials not saved — add your LinkedIn email and password in Profile settings.')
      }
      dbg('linkedin', 'not logged in, attempting login…')
      await loginLinkedIn(page, profile.linkedinEmail, profile.linkedinPassword)
      await context.storageState({ path: LINKEDIN_STATE_PATH })
      dbg('linkedin', 'login successful, session saved')
    } else {
      dbg('linkedin', 'using existing session')
    }

    dbg('linkedin', `navigating to job URL: ${job.url}`)
    try {
      await page.goto(job.url, { waitUntil: 'domcontentloaded', timeout: 30000 })
    } catch (navErr: any) {
      if (/ERR_TOO_MANY_REDIRECTS/i.test(navErr.message)) {
        // LinkedIn is bouncing this specific URL — likely an authwall loop.
        // Clear state so the next attempt retries login from scratch.
        if (fs.existsSync(LINKEDIN_STATE_PATH)) fs.unlinkSync(LINKEDIN_STATE_PATH)
        throw new Error('LinkedIn redirect loop on job page — session cleared, please retry to re-authenticate.')
      }
      throw navErr
    }
    await page.waitForTimeout(3000)
    dbg('linkedin', `landed on: ${page.url()} title="${await page.title()}"`)
    dbg('linkedin', 'scanning for Easy Apply / Apply buttons…')

    const easyApplyBtns = [
      '[aria-label*="Easy Apply"]',
      'a:has-text("Easy Apply")',
      'button:has-text("Easy Apply")',
      'button.jobs-apply-button[aria-label*="Easy Apply"]',
    ]
    let clicked = false
    for (const sel of easyApplyBtns) {
      const btn = page.locator(sel).first()
      if (await btn.isVisible({ timeout: 2000 }).catch(() => false)) {
        dbg('linkedin', `found Easy Apply button via selector: "${sel}"`)
        await btn.click({ timeout: 5000 })
        clicked = true
        break
      }
    }
    if (!clicked) {
      // Log all visible apply-related buttons for debugging
      try {
        const allBtns = await page.locator('button, a[role="button"]').all()
        for (const b of allBtns) {
          const text: string = (await b.innerText().catch(() => '')).trim()
          if (/apply/i.test(text)) dbg('linkedin', `visible button: "${text}"`)
        }
      } catch { /* ok */ }

      const applyBtn = page.locator('button.jobs-apply-button, a.jobs-apply-button').first()
      const btnText: string = await applyBtn.innerText().catch(() => '')
      dbg('linkedin', `no Easy Apply found; jobs-apply-button text="${btnText}"`)
      if (/apply on/i.test(btnText)) {
        throw new Error('This LinkedIn job redirects to the company site — no Easy Apply modal.')
      }
      throw new Error('Could not find LinkedIn Easy Apply button')
    }

    await page.waitForTimeout(2000)
    for (let step = 0; step < 15; step++) {
      dbg('linkedin', `Easy Apply modal — step ${step + 1}`)
      const done = await handleEasyApplyStep(page, profile, answers, email)
      if (done) { dbg('linkedin', `submitted after ${step + 1} step(s)`); break }
      if (step === 14) throw new Error('LinkedIn Easy Apply exceeded maximum steps')
    }

    await context.storageState({ path: LINKEDIN_STATE_PATH })
  } finally {
    await context.close()
    await browser.close()
  }
}

// ─── Indeed (may redirect to company ATS) ────────────────────────────────

async function runIndeedApply(
  job: { url: string },
  profile: ApplyContext['profile'],
  answers: ApplyContext['answers'],
  email: string
): Promise<void> {
  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage()

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
        job: { id: '', url: landedUrl, title: '', company: '' },
        profile,
        email,
        answers,
      })
    } else {
      await handleIndeedEasyApply(page, profile, answers, email)
    }
  } finally {
    await browser.close()
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

    await fillCustomQuestionsWithLLM(page, profile, email, answers).catch(() => null)

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

// ─── Debug helpers ────────────────────────────────────────────────────────

function dbg(tag: string, ...args: any[]) {
  console.log(`[apply:${tag}]`, ...args)
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
    `linkedinEmail=${profile.linkedinEmail || '(none)'}`,
    `linkedinPassword=${profile.linkedinPassword ? '***' : '(none)'}`,
  )

  const ats = detectATS(job.url)
  dbg('ats', `${job.title} @ ${job.company} → ${ats}`, `url=${job.url}`)
  dbg('ats', `isEasyApply=${job.isEasyApply}`)

  try {
    if (ats === 'linkedin') {
      if (job.isEasyApply) {
        throw new Error('LinkedIn Easy Apply — click the link to apply directly on LinkedIn (takes ~2 minutes)')
      }
      dbg('linkedin', 'starting LinkedIn apply flow')
      await runLinkedInApply(
        job,
        profile as ApplyContext['profile'] & { linkedinEmail?: string | null; linkedinPassword?: string | null },
        answers,
        user.email
      )
    } else if (ats === 'indeed') {
      dbg('indeed', 'starting Indeed apply flow')
      await runIndeedApply(job, profile as ApplyContext['profile'], answers, user.email)
    } else {
      const adapter = getAdapter(job.url)
      dbg('adapter', `using adapter: ${adapter.name} for url: ${job.url}`)
      const browser = await chromium.launch({ headless: true })
      const page = await browser.newPage()
      try {
        dbg('adapter', 'navigating and filling form…')
        await adapter.apply({
          page,
          job,
          profile: profile as ApplyContext['profile'],
          email: user.email,
          answers,
        })
        dbg('adapter', `${adapter.name} adapter completed`)
      } finally {
        await browser.close()
      }
    }

    await prisma.application.update({ where: { id: applicationId }, data: { status: 'SUBMITTED' } })
    dbg('done', `✓ Applied: ${job.title} @ ${job.company} [${ats}] (${applicationId})`)
  } catch (err: any) {
    const msg = err.message || 'Unknown error'
    console.error(`✗ Apply failed for ${applicationId}: ${msg}`)
    await prisma.application.update({
      where: { id: applicationId },
      data: { status: 'FAILED', errorMessage: msg },
    })
  }
}

// ─── Worker ───────────────────────────────────────────────────────────────

const worker = new Worker<ApplyJobData>(
  'apply-jobs',
  async (job) => {
    console.log(`Processing application ${job.data.applicationId}`)
    await runApply(job.data)
  },
  { connection, concurrency: 2 }
)

worker.on('completed', (job) => console.log(`Job ${job.id} completed`))
worker.on('failed', (job, err) => console.error(`Job ${job?.id} failed: ${err.message}`))

console.log('Apply worker started, waiting for jobs…')
