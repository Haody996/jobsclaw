import type { ATSAdapter, ApplyContext } from './types'
import { fillCustomQuestionsWithLLM } from './llm-fill'

// Generic fallback: label-heuristic fill + LLM for custom questions.
// Guards against pages that are not actually job-application forms (search
// pages, listing aggregators, newsletter signups) by requiring evidence of
// an application form before submitting.
export const genericAdapter: ATSAdapter = {
  name: 'generic',
  canHandle: () => true,

  async apply({ page, job, profile, email, answers }: ApplyContext) {
    await page.goto(job.url, { waitUntil: 'domcontentloaded', timeout: 30000 })
    await page.waitForTimeout(2000)

    let filledCore = false
    const setCore = (ok: boolean) => { filledCore = filledCore || ok }

    setCore(await fillByLabel(page, ['first name', 'given name'], profile.firstName))
    setCore(await fillByLabel(page, ['last name', 'surname', 'family name'], profile.lastName))
    setCore(await fillByLabel(page, ['email', 'e-mail'], email))
    if (profile.phone) await fillByLabel(page, ['phone', 'mobile', 'telephone'], profile.phone)
    if (profile.address) await fillByLabel(page, ['address', 'street'], profile.address)
    if (profile.city) await fillByLabel(page, ['city', 'town'], profile.city)
    if (profile.state) await fillByLabel(page, ['state', 'province', 'region'], profile.state)
    if (profile.zip) await fillByLabel(page, ['zip', 'postal', 'postcode'], profile.zip)
    if (profile.linkedinUrl) await fillByLabel(page, ['linkedin'], profile.linkedinUrl)
    if (profile.portfolioUrl) await fillByLabel(page, ['website', 'portfolio', 'github'], profile.portfolioUrl)

    let hasResumeInput = false
    if (profile.resumePath) {
      try {
        const fi = page.locator('input[type="file"]').first()
        if ((await fi.count()) > 0) {
          await fi.setInputFiles(profile.resumePath)
          hasResumeInput = true
          await page.waitForTimeout(1000)
        }
      } catch { /* no file input */ }
    }

    // Guard: if no identifying field could be filled and there's no resume
    // upload, this is not an application form — it's a listing/search page.
    // Bail loudly instead of submitting a search form and faking success.
    if (!filledCore && !hasResumeInput) {
      throw new Error('No job application form found on this page — it looks like a job listing or search page, not an apply form. Apply manually.')
    }

    await fillCustomQuestionsWithLLM(page, profile, email, answers)

    const submitted = await clickApplySubmit(page)
    if (!submitted) throw new Error('Generic: could not find an application submit button')

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

// Click an application submit button — never a search / filter / auth button.
async function clickApplySubmit(page: any): Promise<boolean> {
  const selectors = [
    'button:has-text("Submit application")',
    'button:has-text("Submit Application")',
    'button:has-text("Send application")',
    'button:has-text("Submit")',
    'button:has-text("Apply")',
    'button[type="submit"]',
    'input[type="submit"]',
  ]
  for (const sel of selectors) {
    const loc = page.locator(sel).first()
    if (!(await loc.isVisible({ timeout: 1500 }).catch(() => false))) continue
    const text = ((await loc.innerText().catch(() => '')) || '').trim()
    const value = ((await loc.getAttribute('value').catch(() => '')) || '').trim()
    const label = `${text} ${value}`.toLowerCase()
    // Reject controls that submit something other than an application.
    if (/search|filter|sign in|log ?in|register|subscribe|newsletter|save job/.test(label)) continue
    await loc.click({ timeout: 5000 })
    return true
  }
  return false
}
