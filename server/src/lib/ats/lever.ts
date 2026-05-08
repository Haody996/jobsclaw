import type { ATSAdapter, ApplyContext } from './types'
import { fillCustomQuestionsWithLLM } from './llm-fill'

export const leverAdapter: ATSAdapter = {
  name: 'lever',
  canHandle: (url) => url.includes('lever.co') || url.includes('jobs.lever'),

  async apply({ page, job, profile, email, answers }: ApplyContext) {
    // Lever apply URL is always base + /apply
    const baseUrl = job.url.split('?')[0].replace(/\/$/, '')
    const applyUrl = baseUrl.endsWith('/apply') ? baseUrl : `${baseUrl}/apply`
    await page.goto(applyUrl, { waitUntil: 'domcontentloaded', timeout: 30000 })
    await page.waitForTimeout(2000)

    const fullName = [profile.firstName, profile.lastName].filter(Boolean).join(' ')

    // Lever uses a single name field by default
    const filledName = await tryFill(page, 'input[name="name"]', fullName)
    if (!filledName) {
      // Some Lever configs split first/last
      await tryFill(page, '.application-name input:first-of-type, input[name="first_name"]', profile.firstName)
      await tryFill(page, '.application-name input:last-of-type, input[name="last_name"]', profile.lastName)
    }

    await tryFill(page, 'input[name="email"]', email)
    if (profile.phone) await tryFill(page, 'input[name="phone"]', profile.phone)
    if (profile.linkedinUrl) await tryFill(page, 'input[name="urls[LinkedIn]"]', profile.linkedinUrl)
    if (profile.portfolioUrl) {
      await tryFill(page, 'input[name="urls[GitHub]"]', profile.portfolioUrl) ||
        await tryFill(page, 'input[name="urls[Portfolio]"]', profile.portfolioUrl) ||
        await tryFill(page, 'input[name="urls[Other]"]', profile.portfolioUrl)
    }

    // Resume upload — Lever hides the file input; set directly
    if (profile.resumePath) {
      try {
        await page.locator('input[type="file"]').first().setInputFiles(profile.resumePath)
        await page.waitForTimeout(1000)
      } catch { /* no file input */ }
    }

    // LLM for custom questions
    await fillCustomQuestionsWithLLM(page, profile, email, answers)

    // Submit
    const submitted = await tryClick(page, '[data-qa="btn-submit"]') ||
      await tryClick(page, 'button[type="submit"]') ||
      await tryClick(page, 'input[type="submit"]')
    if (!submitted) throw new Error('Lever: could not find submit button')

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
