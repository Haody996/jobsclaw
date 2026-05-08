import type { ATSAdapter, ApplyContext } from './types'
import { fillCustomQuestionsWithLLM } from './llm-fill'

// Ashby HQ — common at YC/tech startups
// Apply URL: https://jobs.ashbyhq.com/<company>/<job-id>/application
export const ashbyAdapter: ATSAdapter = {
  name: 'ashby',
  canHandle: (url) => url.includes('ashbyhq.com') || url.includes('jobs.ashby'),

  async apply({ page, job, profile, email, answers }: ApplyContext) {
    // Ensure we're on the /application page
    const url = job.url.includes('/application') ? job.url : `${job.url.replace(/\/$/, '')}/application`
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 })
    await page.waitForTimeout(2000)

    // Ashby uses React with data-testid attributes
    await tryFill(page, '[data-testid="firstName"], input[name="firstName"], input[id*="firstName"]', profile.firstName)
    await tryFill(page, '[data-testid="lastName"], input[name="lastName"], input[id*="lastName"]', profile.lastName)
    await tryFill(page, '[data-testid="email"], input[name="email"], input[type="email"]', email)
    if (profile.phone) {
      await tryFill(page, '[data-testid="phone"], input[name="phone"], input[name="phoneNumber"]', profile.phone)
    }
    if (profile.linkedinUrl) {
      await tryFill(page, 'input[name*="linkedin"], input[placeholder*="linkedin" i]', profile.linkedinUrl)
    }
    if (profile.portfolioUrl) {
      await tryFill(page, 'input[name*="website"], input[name*="portfolio"], input[placeholder*="website" i]', profile.portfolioUrl)
    }

    // Resume upload
    if (profile.resumePath) {
      try {
        const fileInput = page.locator('input[type="file"]').first()
        if (await fileInput.isVisible({ timeout: 2000 }).catch(() => false)) {
          await fileInput.setInputFiles(profile.resumePath)
          await page.waitForTimeout(1500)
        } else {
          // Ashby sometimes hides the file input — click the upload area first
          const uploadBtn = page.locator('button:has-text("Upload"), [data-testid="resumeUpload"]').first()
          if (await uploadBtn.isVisible({ timeout: 1500 }).catch(() => false)) {
            const [fileChooser] = await Promise.all([
              page.waitForFileChooser({ timeout: 5000 }),
              uploadBtn.click(),
            ])
            await fileChooser.setFiles(profile.resumePath)
            await page.waitForTimeout(1500)
          }
        }
      } catch { /* no resume field */ }
    }

    // LLM for custom questions (Ashby often has many custom fields)
    await fillCustomQuestionsWithLLM(page, profile, email, answers)

    // Submit — Ashby uses "Submit Application" button
    const submitted =
      await tryClick(page, 'button:has-text("Submit Application")') ||
      await tryClick(page, 'button:has-text("Submit")') ||
      await tryClick(page, 'button[type="submit"]')
    if (!submitted) throw new Error('Ashby: could not find submit button')

    await page.waitForTimeout(3000)
  },
}

async function tryFill(page: any, sel: string, value: string): Promise<boolean> {
  if (!value) return false
  try {
    const loc = page.locator(sel).first()
    if (await loc.isVisible({ timeout: 1500 }).catch(() => false)) {
      await loc.fill(value)
      return true
    }
  } catch { /* skip */ }
  return false
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
