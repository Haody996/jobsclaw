import type { ATSAdapter, ApplyContext } from './types'
import { fillCustomQuestionsWithLLM } from './llm-fill'

// Generic fallback: label-heuristic fill + LLM for custom questions
export const genericAdapter: ATSAdapter = {
  name: 'generic',
  canHandle: () => true,

  async apply({ page, job, profile, email, answers }: ApplyContext) {
    await page.goto(job.url, { waitUntil: 'domcontentloaded', timeout: 30000 })
    await page.waitForTimeout(2000)

    await fillByLabel(page, ['first name', 'given name'], profile.firstName)
    await fillByLabel(page, ['last name', 'surname', 'family name'], profile.lastName)
    await fillByLabel(page, ['email', 'e-mail'], email)
    if (profile.phone) await fillByLabel(page, ['phone', 'mobile', 'telephone'], profile.phone)
    if (profile.address) await fillByLabel(page, ['address', 'street'], profile.address)
    if (profile.city) await fillByLabel(page, ['city', 'town'], profile.city)
    if (profile.state) await fillByLabel(page, ['state', 'province', 'region'], profile.state)
    if (profile.zip) await fillByLabel(page, ['zip', 'postal', 'postcode'], profile.zip)
    if (profile.linkedinUrl) await fillByLabel(page, ['linkedin'], profile.linkedinUrl)
    if (profile.portfolioUrl) await fillByLabel(page, ['website', 'portfolio', 'github'], profile.portfolioUrl)

    if (profile.resumePath) {
      try {
        await page.locator('input[type="file"]').first().setInputFiles(profile.resumePath)
        await page.waitForTimeout(1000)
      } catch { /* no file input */ }
    }

    // LLM handles everything else
    await fillCustomQuestionsWithLLM(page, profile, email, answers)

    const submitted =
      await tryClick(page, 'button[type="submit"]') ||
      await tryClick(page, 'input[type="submit"]') ||
      await tryClick(page, 'button:has-text("Submit")') ||
      await tryClick(page, 'button:has-text("Apply")') ||
      await tryClick(page, 'button:has-text("Send Application")')
    if (!submitted) throw new Error('Generic: could not find submit button')

    await page.waitForTimeout(3000)
  },
}

async function fillByLabel(page: any, keywords: string[], value: string): Promise<boolean> {
  if (!value) return false
  try {
    const labels = await page.$$('label')
    for (const label of labels) {
      const text: string = (await label.innerText().catch(() => '')).toLowerCase()
      if (!keywords.some((kw) => text.includes(kw))) continue
      const forAttr: string = await label.getAttribute('for').catch(() => '')
      if (forAttr) {
        const loc = page.locator(`#${forAttr}`).first()
        if (await loc.isVisible({ timeout: 800 }).catch(() => false)) {
          await loc.fill(value)
          return true
        }
      }
      const sibling = label.locator('~ input, ~ textarea').first()
      if (await sibling.isVisible({ timeout: 800 }).catch(() => false)) {
        await sibling.fill(value)
        return true
      }
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
