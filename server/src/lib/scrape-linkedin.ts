import axios from 'axios'
import * as cheerio from 'cheerio'

export interface ScrapedJob {
  title: string
  company: string
  link: string
  location: string
}

export async function scrapeLinkedInJobs(
  keywords: string,
  location: string,
  limit = 50
): Promise<ScrapedJob[]> {
  const url =
    `https://www.linkedin.com/jobs/search/?keywords=${encodeURIComponent(keywords)}` +
    `&location=${encodeURIComponent(location)}&f_TPR=r86400&position=1&pageNum=0`

  const response = await axios.get(url, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
      'Accept-Language': 'en-US,en;q=0.9',
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    },
    timeout: 20000,
  })

  if (response.status !== 200) {
    throw new Error(`LinkedIn scrape failed with status ${response.status}`)
  }

  const $ = cheerio.load(response.data)
  const jobs: ScrapedJob[] = []

  $('div.base-card').each((_, card) => {
    if (jobs.length >= limit) return false

    const title = $(card).find('h3.base-search-card__title').text().trim()
    const company = $(card).find('h4.base-search-card__subtitle').text().trim()
    const rawLink = $(card).find('a.base-card__full-link').attr('href') || ''
    const loc = $(card).find('.job-search-card__location').text().trim()

    if (title && company && rawLink) {
      jobs.push({
        title,
        company,
        link: rawLink.split('?')[0],
        location: loc,
      })
    }
  })

  return jobs
}
