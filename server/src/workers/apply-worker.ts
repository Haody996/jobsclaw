import 'dotenv/config'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { Worker } from 'bullmq'
import { chromium } from 'playwright'
import { connection } from '../lib/queue'
import prisma from '../lib/prisma'

// Persistent LinkedIn session state path
const LINKEDIN_STATE_PATH = path.join(os.homedir(), '.config', 'autoapply', 'linkedin-state.json')

interface ApplyJobData {
  applicationId: string
  jobId: string
  userId: string
}

// Greenhouse ATS selectors (direct form page)
const GREENHOUSE_SELECTORS = {
  firstName: '#first_name',
  lastName: '#last_name',
  email: '#email',
  phone: '#phone',
  resume: '#resume',
  submit: '#submit_app',
}

// Click a visible element. Returns false immediately if not visible.
async function tryClick(page: any, sel: string): Promise<boolean> {
  try {
    const loc = page.locator(sel).first()
    const visible = await loc.isVisible({ timeout: 2000 }).catch(() => false)
    if (visible) {
      await loc.click({ timeout: 5000 })
      return true
    }
  } catch { /* not clickable */ }
  return false
}

// Fill a visible input. Returns false immediately if not visible.
async function tryFill(page: any, sel: string, value: string): Promise<boolean> {
  if (!value) return false
  try {
    const loc = page.locator(sel).first()
    const visible = await loc.isVisible({ timeout: 2000 }).catch(() => false)
    if (visible) {
      await loc.fill(value)
      return true
    }
  } catch { /* not fillable */ }
  return false
}

// Lever: navigate to /apply URL and fill their standard form
async function fillLeverForm(page: any, profile: any, answers: any[], email: string): Promise<void> {
  const fullName = [profile.firstName, profile.lastName].filter(Boolean).join(' ')

  // Full name (Lever standard — single field)
  const filledName = await tryFill(page, 'input[name="name"]', fullName)
  if (!filledName) {
    // Fallback: some Lever configs split first/last
    await tryFill(page, '.application-name input:first-of-type', profile.firstName)
    await tryFill(page, '.application-name input:last-of-type', profile.lastName)
  }

  await tryFill(page, 'input[name="email"]', email)
  if (profile.phone) await tryFill(page, 'input[name="phone"]', profile.phone)
  if (profile.linkedinUrl) await tryFill(page, 'input[name="urls[LinkedIn]"]', profile.linkedinUrl)
  if (profile.portfolioUrl) {
    await tryFill(page, 'input[name="urls[GitHub]"]', profile.portfolioUrl) ||
    await tryFill(page, 'input[name="urls[Portfolio]"]', profile.portfolioUrl)
  }

  // Resume — Lever hides the file input behind a button; use setInputFiles directly
  if (profile.resumePath) {
    try {
      await page.locator('input[type="file"]').first().setInputFiles(profile.resumePath)
    } catch { /* no file input */ }
  }

  // Custom questions via generic label heuristic
  await fillGenericForm(page, profile, answers, email)
}

// Greenhouse: fill their standard form (form is on the listing page itself)
async function fillGreenhouseForm(page: any, profile: any, email: string): Promise<void> {
  await tryFill(page, GREENHOUSE_SELECTORS.firstName, profile.firstName)
  await tryFill(page, GREENHOUSE_SELECTORS.lastName, profile.lastName)
  await tryFill(page, GREENHOUSE_SELECTORS.email, email)
  if (profile.phone) await tryFill(page, GREENHOUSE_SELECTORS.phone, profile.phone)
  if (profile.resumePath) {
    try {
      await page.locator(GREENHOUSE_SELECTORS.resume).first().setInputFiles(profile.resumePath)
    } catch { /* no file input */ }
  }
}

function detectATS(url: string): string {
  if (url.includes('greenhouse.io') || url.includes('boards.greenhouse')) return 'greenhouse'
  if (url.includes('lever.co') || url.includes('jobs.lever')) return 'lever'
  if (url.includes('myworkdayjobs.com') || url.includes('wd1.myworkdayjobs')) return 'workday'
  if (url.includes('indeed.com')) return 'indeed'
  if (url.includes('linkedin.com/jobs')) return 'linkedin'
  return 'generic'
}

async function findAndFill(page: any, labelKeywords: string[], value: string): Promise<boolean> {
  for (const keyword of labelKeywords) {
    try {
      const labels = await page.$$('label')
      for (const label of labels) {
        const text = (await label.innerText()).toLowerCase()
        if (text.includes(keyword.toLowerCase())) {
          const forAttr = await label.getAttribute('for')
          if (forAttr) {
            const loc = page.locator(`#${forAttr}`).first()
            if (await loc.isVisible({ timeout: 1000 }).catch(() => false)) {
              await loc.fill(value)
              return true
            }
          }
          const loc = label.locator('~ input, ~ textarea').first()
          if (await loc.isVisible({ timeout: 1000 }).catch(() => false)) {
            await loc.fill(value)
            return true
          }
        }
      }
    } catch { /* continue */ }
  }
  return false
}

async function fillGenericForm(page: any, profile: any, answers: any[], email: string): Promise<void> {
  await findAndFill(page, ['first name', 'given name'], profile.firstName)
  await findAndFill(page, ['last name', 'surname', 'family name'], profile.lastName)
  await findAndFill(page, ['email', 'e-mail'], email)
  if (profile.phone) await findAndFill(page, ['phone', 'mobile', 'telephone'], profile.phone)
  if (profile.address) await findAndFill(page, ['address', 'street'], profile.address)
  if (profile.city) await findAndFill(page, ['city', 'town'], profile.city)
  if (profile.state) await findAndFill(page, ['state', 'province', 'region'], profile.state)
  if (profile.zip) await findAndFill(page, ['zip', 'postal', 'postcode'], profile.zip)
  for (const qa of answers) {
    const keywords = qa.question.toLowerCase().split(' ').filter((w: string) => w.length > 3)
    await findAndFill(page, keywords, qa.answer)
  }
}

// Indeed: click through the apply button, then handle wherever we land
async function handleIndeed(
  page: any,
  profile: any,
  answers: any[],
  email: string
): Promise<string> {
  // Click the main apply CTA on the Indeed job listing page
  const applyBtnSelectors = [
    '[data-testid="applyButton"]',
    '[data-testid="indeedApplyButton"]',
    '#indeedApplyButton',
    '.ia-IndeedApplyButton',
    'button:has-text("Apply on company site")',
    'a:has-text("Apply on company site")',
    'button:has-text("Easily apply")',
    'button:has-text("Apply now")',
  ]

  let clicked = false
  for (const sel of applyBtnSelectors) {
    try {
      const loc = page.locator(sel).first()
      const visible = await loc.isVisible({ timeout: 2000 }).catch(() => false)
      if (visible) {
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
    // Redirected to a company ATS — detect and fill
    const ats = detectATS(landedUrl)
    if (ats === 'workday') throw new Error('Workday ATS not yet supported — please apply manually')
    if (ats === 'lever') {
      await fillLeverForm(page, profile, answers, email)
    } else if (ats === 'greenhouse') {
      await fillGreenhouseForm(page, profile, email)
    } else {
      await fillGenericForm(page, profile, answers, email)
      if (profile.resumePath) {
        try { await page.locator('input[type="file"]').first().setInputFiles(profile.resumePath) } catch { /* ok */ }
      }
    }
    return ats
  }

  // Still on Indeed — handle Indeed Easy Apply stepped form
  await handleIndeedEasyApply(page, profile, answers, email)
  return 'indeed-easy-apply'
}

// Indeed Easy Apply: multi-step form within Indeed's site
async function handleIndeedEasyApply(page: any, profile: any, answers: any[], email: string): Promise<void> {
  const maxSteps = 8

  for (let step = 0; step < maxSteps; step++) {
    await page.waitForTimeout(1500)

    // Fill contact fields using Indeed's data-testid attributes
    const indeedFields: [string, string][] = [
      ['[data-testid="ia-FirstName-input"], input[name="applicant.name"]', profile.firstName],
      ['[data-testid="ia-LastName-input"]', profile.lastName],
      ['[data-testid="ia-EmailAddress-input"], input[name="applicant.email"]', email],
      ['[data-testid="ia-PhoneNumber-input"], input[name="applicant.phoneNumber"]', profile.phone || ''],
      ['[data-testid="ia-City-input"]', profile.city || ''],
    ]

    for (const [sel, value] of indeedFields) {
      if (!value) continue
      try {
        const input = await page.$(sel)
        if (input) {
          await input.fill('')
          await input.fill(value)
        }
      } catch { /* continue */ }
    }

    // Upload resume on any file input found
    if (profile.resumePath) {
      try {
        const fileInput = await page.$('input[type="file"]')
        if (fileInput) await fileInput.setInputFiles(profile.resumePath)
      } catch { /* continue */ }
    }

    // Answer any Q&A fields using generic label heuristic
    await fillGenericForm(page, profile, answers, email)

    // Look for "Continue" or final "Submit" button
    const continueSelectors = [
      'button[data-testid="ia-continueButton"]',
      'button:has-text("Continue")',
      'button:has-text("Next")',
    ]
    const submitSelectors = [
      'button[data-testid="ia-SubmitButton"]',
      'button:has-text("Submit your application")',
      'button:has-text("Submit application")',
      'button[type="submit"]',
    ]

    // Check for final submit first
    for (const sel of submitSelectors) {
      if (await tryClick(page, sel)) {
        await page.waitForTimeout(3000)
        return // Done
      }
    }

    // Otherwise click Continue to advance to next step
    let advanced = false
    for (const sel of continueSelectors) {
      if (await tryClick(page, sel)) {
        advanced = true
        break
      }
    }

    if (!advanced) throw new Error('Could not advance Indeed Easy Apply form')
  }

  throw new Error('Indeed Easy Apply exceeded maximum steps without submitting')
}

// --- LinkedIn Easy Apply ---

async function loginLinkedIn(page: any, email: string, password: string): Promise<void> {
  console.log('LinkedIn: logging in...')
  await page.goto('https://www.linkedin.com/login', { waitUntil: 'domcontentloaded', timeout: 30000 })
  await page.waitForTimeout(1500)
  await page.fill('#username', email)
  await page.fill('#password', password)
  await page.click('button[type="submit"]')
  await page.waitForTimeout(5000)

  const url: string = page.url()
  if (url.includes('/checkpoint/') || url.includes('/challenge/') || url.includes('/authwall')) {
    throw new Error('LinkedIn requires CAPTCHA or 2FA. Please log in manually once via a browser, export cookies, or resolve the checkpoint.')
  }
  if (url.includes('/login')) {
    throw new Error('LinkedIn login failed — check your email and password in Profile settings.')
  }
  console.log('LinkedIn: logged in successfully')
}

// Handle a single Easy Apply modal step: fill fields, upload resume, advance or submit.
// Returns true when the application was submitted.
async function handleEasyApplyStep(page: any, profile: any, answers: any[], email: string): Promise<boolean> {
  await page.waitForTimeout(1500)

  const modal = page.locator('.jobs-easy-apply-modal, [data-test-modal]').first()

  // --- Contact / basic fields ---
  const fieldMap: [string, string][] = [
    ['input[id*="first-name"], input[name="firstName"]', profile.firstName || ''],
    ['input[id*="last-name"], input[name="lastName"]', profile.lastName || ''],
    ['input[id*="phoneNumber"], input[name="phoneNumber"], input[id*="phone"]', profile.phone || ''],
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

  // --- Resume upload ---
  if (profile.resumePath) {
    try {
      const fileInput = modal.locator('input[type="file"]').first()
      if (await fileInput.isVisible({ timeout: 1000 }).catch(() => false)) {
        await fileInput.setInputFiles(profile.resumePath)
        await page.waitForTimeout(1000)
      }
    } catch { /* no file input on this step */ }
  }

  // --- Select dropdowns (Yes/No, numeric experience, etc.) ---
  try {
    const selects = await modal.locator('select').all()
    for (const select of selects) {
      if (!await select.isVisible({ timeout: 500 }).catch(() => false)) continue
      const options: string[] = await select.locator('option').allInnerTexts()
      const labelEl = await select.locator('xpath=../..').locator('label').first().innerText().catch(() => '')

      // Check Q&A bank for a matching answer
      let matched = false
      for (const qa of answers) {
        if (labelEl.toLowerCase().includes(qa.question.toLowerCase().substring(0, 20))) {
          const matchOpt = options.find((o) => o.toLowerCase().includes(qa.answer.toLowerCase()))
          if (matchOpt) { await select.selectOption({ label: matchOpt.trim() }); matched = true; break }
        }
      }
      if (!matched) {
        // Default heuristics: prefer "Yes" for authorization/sponsorship-style questions
        const yesOpt = options.find((o) => /^yes$/i.test(o.trim()))
        if (yesOpt) await select.selectOption({ label: yesOpt.trim() })
      }
    }
  } catch { /* ok */ }

  // --- Text inputs via label heuristic (Q&A bank + profile fields) ---
  await fillGenericForm(page, profile, answers, email)

  // --- Radio buttons: pick first visible option for unanswered groups ---
  try {
    const fieldsets = await modal.locator('fieldset').all()
    for (const fieldset of fieldsets) {
      const radios = await fieldset.locator('input[type="radio"]').all()
      if (!radios.length) continue
      let anyChecked = false
      for (const r of radios) {
        if (await r.isChecked().catch(() => false)) { anyChecked = true; break }
      }
      if (!anyChecked && radios[0]) {
        await radios[0].check({ timeout: 2000 }).catch(() => null)
      }
    }
  } catch { /* ok */ }

  // --- Submit / Review / Next ---
  const footerBtns = modal.locator('footer button, .artdeco-modal__actionbar button')

  // Submit application
  for (const txt of ['Submit application', 'Submit your application']) {
    const btn = footerBtns.filter({ hasText: txt }).first()
    if (await btn.isVisible({ timeout: 1000 }).catch(() => false)) {
      await btn.click({ timeout: 5000 })
      await page.waitForTimeout(3000)
      return true
    }
  }

  // Review / Next / Continue
  for (const txt of ['Review', 'Next', 'Continue to next step']) {
    const btn = footerBtns.filter({ hasText: txt }).first()
    if (await btn.isVisible({ timeout: 1000 }).catch(() => false)) {
      await btn.click({ timeout: 5000 })
      return false
    }
  }

  // Fallback: any primary button in footer
  const primaryBtn = footerBtns.filter({ hasText: /submit|next|review|continue/i }).first()
  if (await primaryBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
    const label = await primaryBtn.innerText()
    await primaryBtn.click({ timeout: 5000 })
    if (/submit/i.test(label)) { await page.waitForTimeout(3000); return true }
    return false
  }

  throw new Error('Could not find Next/Submit button in LinkedIn Easy Apply modal')
}

async function runLinkedInApply(
  job: any,
  profile: any,
  answers: any[],
  email: string
): Promise<void> {
  // Ensure config dir exists for session state
  const configDir = path.join(os.homedir(), '.config', 'autoapply')
  if (!fs.existsSync(configDir)) fs.mkdirSync(configDir, { recursive: true })

  const stateExists = fs.existsSync(LINKEDIN_STATE_PATH)
  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext(
    stateExists ? { storageState: LINKEDIN_STATE_PATH } : {}
  )
  const page = await context.newPage()

  try {
    // Check login state
    await page.goto('https://www.linkedin.com/feed/', { waitUntil: 'domcontentloaded', timeout: 30000 })
    await page.waitForTimeout(2000)
    const isLoggedIn = !page.url().includes('/login') && !page.url().includes('/authwall')

    if (!isLoggedIn) {
      if (!profile.linkedinEmail || !profile.linkedinPassword) {
        throw new Error('LinkedIn credentials not saved. Please add your LinkedIn email and password in Profile > LinkedIn Easy Apply section.')
      }
      await loginLinkedIn(page, profile.linkedinEmail, profile.linkedinPassword)
      await context.storageState({ path: LINKEDIN_STATE_PATH })
      console.log('LinkedIn: session saved')
    } else {
      console.log('LinkedIn: using saved session')
    }

    // Navigate to the job page
    await page.goto(job.url, { waitUntil: 'domcontentloaded', timeout: 30000 })
    await page.waitForTimeout(3000)

    // Find and click Easy Apply button
    const easyApplySelectors = [
      'button.jobs-apply-button[aria-label*="Easy Apply"]',
      '.jobs-apply-button:has-text("Easy Apply")',
      'button[aria-label*="Easy Apply"]',
      'button:has-text("Easy Apply")',
    ]
    let clicked = false
    for (const sel of easyApplySelectors) {
      const btn = page.locator(sel).first()
      if (await btn.isVisible({ timeout: 2000 }).catch(() => false)) {
        await btn.click({ timeout: 5000 })
        clicked = true
        break
      }
    }
    if (!clicked) {
      // Check if it's "Apply" (external) or the modal is already open
      const applyBtn = page.locator('button.jobs-apply-button').first()
      const btnText = await applyBtn.innerText().catch(() => '')
      if (/apply on/i.test(btnText)) {
        throw new Error('This LinkedIn job requires applying on the company site — no Easy Apply available.')
      }
      throw new Error('Could not find LinkedIn Easy Apply button')
    }

    await page.waitForTimeout(2000)

    // Step through the modal
    const MAX_STEPS = 15
    for (let step = 0; step < MAX_STEPS; step++) {
      const done = await handleEasyApplyStep(page, profile, answers, email)
      if (done) {
        console.log(`LinkedIn Easy Apply: submitted after ${step + 1} step(s)`)
        break
      }
      if (step === MAX_STEPS - 1) {
        throw new Error('LinkedIn Easy Apply exceeded maximum steps without submitting')
      }
    }

    // Save updated session state
    await context.storageState({ path: LINKEDIN_STATE_PATH })
  } finally {
    await context.close()
    await browser.close()
  }
}

async function submitForm(page: any, knownSubmitSelector?: string): Promise<void> {
  const submitSelectors = [
    knownSubmitSelector,
    'button[type="submit"]',
    'input[type="submit"]',
    'button:has-text("Submit")',
    'button:has-text("Apply")',
    'button:has-text("Send Application")',
    'button:has-text("Submit application")',
    'button:has-text("Submit your application")',
  ].filter(Boolean) as string[]

  for (const sel of submitSelectors) {
    if (await tryClick(page, sel)) {
      await page.waitForTimeout(3000)
      return
    }
  }

  throw new Error('Could not find submit button')
}

async function runApply(data: ApplyJobData): Promise<void> {
  const { applicationId, jobId, userId } = data

  await prisma.application.update({
    where: { id: applicationId },
    data: { status: 'IN_PROGRESS' },
  })

  const [job, profile, user, answers] = await Promise.all([
    prisma.job.findUnique({ where: { id: jobId } }),
    prisma.profile.findUnique({ where: { userId } }),
    prisma.user.findUnique({ where: { id: userId }, select: { email: true } }),
    prisma.commonAnswer.findMany({ where: { userId } }),
  ])

  if (!job || !profile || !user) {
    await prisma.application.update({
      where: { id: applicationId },
      data: { status: 'FAILED', errorMessage: 'Missing profile data' },
    })
    return
  }

  const ats = detectATS(job.url)

  if (ats === 'workday') {
    await prisma.application.update({
      where: { id: applicationId },
      data: { status: 'FAILED', errorMessage: 'Workday ATS not yet supported — please apply manually' },
    })
    return
  }

  // LinkedIn uses its own browser context flow (persistent session)
  if (ats === 'linkedin') {
    try {
      await runLinkedInApply(job, profile, answers, user.email)
      await prisma.application.update({
        where: { id: applicationId },
        data: { status: 'SUBMITTED' },
      })
      console.log(`✓ LinkedIn Easy Apply: ${job.title} at ${job.company} (${applicationId})`)
    } catch (err: any) {
      const msg = err.message || 'Unknown error'
      console.error(`✗ LinkedIn apply failed for ${applicationId}: ${msg}`)
      await prisma.application.update({
        where: { id: applicationId },
        data: { status: 'FAILED', errorMessage: msg },
      })
    }
    return
  }

  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage()

  try {
    if (ats === 'lever') {
      // Navigate directly to /apply URL (strip query params, append /apply if missing)
      const baseUrl = job.url.split('?')[0].replace(/\/$/, '')
      const applyUrl = baseUrl.endsWith('/apply') ? baseUrl : `${baseUrl}/apply`
      console.log(`Lever: navigating to ${applyUrl}`)
      await page.goto(applyUrl, { waitUntil: 'domcontentloaded', timeout: 30000 })
      await page.waitForTimeout(2000) // let JS render the form
      await fillLeverForm(page, profile, answers, user.email)
      await submitForm(page, '[data-qa="btn-submit"]')
    } else if (ats === 'greenhouse') {
      await page.goto(job.url, { waitUntil: 'domcontentloaded', timeout: 30000 })
      await fillGreenhouseForm(page, profile, user.email)
      await submitForm(page, GREENHOUSE_SELECTORS.submit)
    } else if (ats === 'indeed') {
      await page.goto(job.url, { waitUntil: 'domcontentloaded', timeout: 30000 })
      const landedAts = await handleIndeed(page, profile, answers, user.email)
      if (landedAts !== 'indeed-easy-apply') {
        const submitSel = landedAts === 'lever' ? '[data-qa="btn-submit"]'
          : landedAts === 'greenhouse' ? GREENHOUSE_SELECTORS.submit
          : undefined
        await submitForm(page, submitSel)
      }
    } else {
      // Generic form fill
      await page.goto(job.url, { waitUntil: 'domcontentloaded', timeout: 30000 })
      await fillGenericForm(page, profile, answers, user.email)
      if (profile.resumePath) {
        try { await page.locator('input[type="file"]').first().setInputFiles(profile.resumePath) } catch { /* ok */ }
      }
      await submitForm(page)
    }

    await prisma.application.update({
      where: { id: applicationId },
      data: { status: 'SUBMITTED' },
    })
    console.log(`✓ Applied to ${job.title} at ${job.company} (${applicationId})`)
  } catch (err: any) {
    const msg = err.message || 'Unknown error'
    console.error(`✗ Apply failed for ${applicationId}: ${msg}`)
    await prisma.application.update({
      where: { id: applicationId },
      data: { status: 'FAILED', errorMessage: msg },
    })
  } finally {
    await browser.close()
  }
}

// Start worker
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

console.log('Apply worker started, waiting for jobs...')
