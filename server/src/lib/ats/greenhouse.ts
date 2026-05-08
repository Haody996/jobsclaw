import type { ATSAdapter, ApplyContext } from './types'
import { fillCustomQuestionsWithLLM } from './llm-fill'

export const greenhouseAdapter: ATSAdapter = {
  name: 'greenhouse',
  canHandle: (url) => url.includes('greenhouse.io') || url.includes('boards.greenhouse'),

  async apply({ page, job, profile, email, answers }: ApplyContext) {
    await page.goto(job.url, { waitUntil: 'domcontentloaded', timeout: 30000 })
    await page.waitForTimeout(1500)

    // Standard fields
    await tryFill(page, '#first_name', profile.firstName)
    await tryFill(page, '#last_name', profile.lastName)
    await tryFill(page, '#email', email)
    if (profile.phone) await tryFill(page, '#phone', profile.phone)

    // Resume upload
    if (profile.resumePath) {
      try {
        await page.locator('#resume, input[type="file"]').first().setInputFiles(profile.resumePath)
        await page.waitForTimeout(1000)
      } catch { /* no file input */ }
    }

    // Additional standard fields some Greenhouse forms have
    if (profile.linkedinUrl) await tryFill(page, 'input[name*="linkedin"], input[id*="linkedin"]', profile.linkedinUrl)
    if (profile.portfolioUrl) {
      await tryFill(page, 'input[name*="website"], input[id*="website"]', profile.portfolioUrl) ||
        await tryFill(page, 'input[name*="portfolio"], input[id*="portfolio"]', profile.portfolioUrl)
    }

    // LLM for custom questions
    await fillCustomQuestionsWithLLM(page, profile, email, answers)

    // Submit
    await clickSubmit(page, ['#submit_app', 'button[type="submit"]', 'input[type="submit"]'])

    await page.waitForTimeout(3000)
    // Confirm success — Greenhouse shows a "Thank you" message on the same page
    const bodyText: string = await page.evaluate(() => document.body.innerText)
    if (/thank you|application.*received|successfully.*submitted/i.test(bodyText)) return
    // If no confirmation, assume submitted (Greenhouse sometimes navigates)
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

async function clickSubmit(page: any, selectors: string[]): Promise<void> {
  for (const sel of selectors) {
    try {
      const loc = page.locator(sel).first()
      if (await loc.isVisible({ timeout: 2000 }).catch(() => false)) {
        await loc.click({ timeout: 5000 })
        return
      }
    } catch { /* try next */ }
  }
  throw new Error('Greenhouse: could not find submit button')
}
