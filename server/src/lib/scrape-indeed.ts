import axios from 'axios'
import * as cheerio from 'cheerio'
import type { ScrapedJob } from './scrape-linkedin'

export async function scrapeIndeedJobs(
  keywords: string,
  location: string,
  limit = 50
): Promise<ScrapedJob[]> {
  const jobs: ScrapedJob[] = []
  const perPage = 10 // Indeed shows ~15 per page
  const maxPages = Math.ceil(limit / perPage)

  for (let page = 0; page < maxPages && jobs.length < limit; page++) {
    const start = page * perPage
    const url =
      `https://www.indeed.com/jobs?q=${encodeURIComponent(keywords)}` +
      `&l=${encodeURIComponent(location)}&fromage=1&start=${start}`

    try {
      const response = await axios.get(url, {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
          'Accept-Language': 'en-US,en;q=0.9',
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        },
        timeout: 15000,
      })

      if (response.status !== 200) break

      const $ = cheerio.load(response.data)
      let found = 0

      // Indeed job cards use various selectors
      $('div.job_seen_beacon, div.jobsearch-ResultsList div.result, div[data-jk]').each((_, card) => {
        if (jobs.length >= limit) return false

        const titleEl = $(card).find('h2.jobTitle a, h2 a, a[data-jk]').first()
        const title = titleEl.find('span').first().text().trim() || titleEl.text().trim()
        const company = $(card).find('[data-testid="company-name"], span.companyName, span.company').first().text().trim()
        const loc = $(card).find('[data-testid="text-location"], div.companyLocation, div.company_location').first().text().trim()
        const jk = $(card).attr('data-jk') || titleEl.attr('data-jk') || titleEl.attr('href')?.match(/jk=([^&]+)/)?.[1] || ''

        if (title && company && jk) {
          jobs.push({
            title,
            company,
            link: `https://www.indeed.com/viewjob?jk=${jk}`,
            location: loc,
          })
          found++
        }
      })

      // No more results on this page
      if (found === 0) break
    } catch (err: any) {
      console.warn(`[scrape-indeed] Page ${page} failed: ${err?.message}`)
      break
    }
  }

  return jobs
}
