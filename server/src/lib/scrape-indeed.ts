import axios from 'axios'
import type { ScrapedJob } from './scrape-linkedin'

/**
 * Fetch jobs from The Muse API (free, no key required).
 * Supports category + location filtering.
 */
export async function scrapeTheMuseJobs(
  keywords: string,
  location: string,
  limit = 20
): Promise<ScrapedJob[]> {
  const jobs: ScrapedJob[] = []
  try {
    // The Muse supports category and location params
    const locParam = location ? `&location=${encodeURIComponent(location)}` : ''
    const url = `https://www.themuse.com/api/public/jobs?category=Software%20Engineering${locParam}&page=0`

    const { data } = await axios.get(url, { timeout: 15000 })
    const results = data?.results || []

    for (const r of results) {
      if (jobs.length >= limit) break
      const title = r.name || ''
      const company = r.company?.name || ''
      const loc = r.locations?.map((l: any) => l.name).join(', ') || ''
      const link = r.refs?.landing_page || `https://www.themuse.com/jobs/${r.id}`

      // Filter by keywords if title doesn't match at all
      const kw = keywords.toLowerCase()
      const titleLower = title.toLowerCase()
      const kwWords = kw.split(/[,\s]+/).filter(Boolean)
      const matches = kwWords.some((w) => titleLower.includes(w))
      if (!matches && kwWords.length > 0) continue

      if (title && company) {
        jobs.push({ title, company, link, location: loc })
      }
    }
  } catch (err: any) {
    console.warn(`[scrape-themuse] Failed: ${err?.message}`)
  }
  return jobs
}

/**
 * Fetch jobs from Arbeitnow API (free, no key required).
 * Global remote-friendly jobs. Keyword filtering done client-side.
 */
export async function scrapeArbeitnowJobs(
  keywords: string,
  _location: string,
  limit = 20
): Promise<ScrapedJob[]> {
  const jobs: ScrapedJob[] = []
  try {
    const { data } = await axios.get('https://www.arbeitnow.com/api/job-board-api', { timeout: 15000 })
    const results = data?.data || []

    const kw = keywords.toLowerCase()
    const kwWords = kw.split(/[,\s]+/).filter(Boolean)

    for (const r of results) {
      if (jobs.length >= limit) break
      const title = r.title || ''
      const company = r.company_name || ''
      const loc = r.location || ''
      const link = r.url || ''

      // Filter by keywords
      const titleLower = title.toLowerCase()
      const matches = kwWords.some((w) => titleLower.includes(w))
      if (!matches && kwWords.length > 0) continue

      if (title && company && link) {
        jobs.push({ title, company, link, location: loc })
      }
    }
  } catch (err: any) {
    console.warn(`[scrape-arbeitnow] Failed: ${err?.message}`)
  }
  return jobs
}
