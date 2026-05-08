import type { ATSAdapter, ApplyContext } from './types'
import { fillCustomQuestionsWithLLM } from './llm-fill'

// iCIMS — enterprise ATS, requires account creation for most applications.
// Attempt a best-effort fill; if it hits a login wall, throw manual-required.
export const icimsAdapter: ATSAdapter = {
  name: 'icims',
  canHandle: (url) => url.includes('.icims.com'),

  async apply({ page, job, profile, email, answers }: ApplyContext) {
    await page.goto(job.url, { waitUntil: 'domcontentloaded', timeout: 30000 })
    await page.waitForTimeout(2000)

    // Detect login wall
    const pageText: string = await page.evaluate(() => document.body.innerText)
    if (/sign in|create an account|log in to apply/i.test(pageText)) {
      throw new Error(
        'iCIMS requires an account to apply. Please apply manually via the link.'
      )
    }

    // Some iCIMS forms allow guest applications — attempt fill
    await tryFill(page, 'input[name*="firstname" i], input[id*="firstname" i]', profile.firstName)
    await tryFill(page, 'input[name*="lastname" i], input[id*="lastname" i]', profile.lastName)
    await tryFill(page, 'input[type="email"], input[name*="email" i]', email)
    if (profile.phone) await tryFill(page, 'input[name*="phone" i], input[id*="phone" i]', profile.phone)

    if (profile.resumePath) {
      try {
        await page.locator('input[type="file"]').first().setInputFiles(profile.resumePath)
        await page.waitForTimeout(1000)
      } catch { /* no file input */ }
    }

    await fillCustomQuestionsWithLLM(page, profile, email, answers)

    const submitted =
      await tryClick(page, 'button[type="submit"]') ||
      await tryClick(page, 'input[type="submit"]') ||
      await tryClick(page, 'button:has-text("Apply")') ||
      await tryClick(page, 'button:has-text("Submit")')
    if (!submitted) throw new Error('iCIMS: could not find submit button')

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
