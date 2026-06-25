import 'dotenv/config'
import { Worker, Job } from 'bullmq'
import { connection } from '../lib/queue'
import prisma from '../lib/prisma'
import { scrapeLinkedInJobs } from '../lib/scrape-linkedin'
import { scrapeTheMuseJobs, scrapeArbeitnowJobs } from '../lib/scrape-indeed'
import { matchJobsToResume } from '../lib/match-jobs-llm'
import { sendDigestEmail } from '../lib/send-email'
import { resolveBestApplyUrl, classifyTier } from '../lib/resolve-apply-url'
import type { ScrapedJob } from '../lib/scrape-linkedin'
import type { JobMatch, MatchSection } from '../lib/match-jobs-llm'

interface Progress {
  step: string
  percent: number
  detail?: string
}

async function progress(job: Job, step: string, percent: number, detail?: string) {
  const p: Progress = { step, percent, ...(detail ? { detail } : {}) }
  await job.updateProgress(p)
  console.log(`[sourcing-worker] [${job.id}] ${percent}% — ${step}${detail ? `: ${detail}` : ''}`)
}

async function scrapeForKeywords(keywords: string, location: string, fetchCount: number): Promise<ScrapedJob[]> {
  const [linkedinJobs, museJobs, arbeitnowJobs] = await Promise.allSettled([
    scrapeLinkedInJobs(keywords, location, fetchCount),
    scrapeTheMuseJobs(keywords, location, 20),
    scrapeArbeitnowJobs(keywords, location, 20),
  ])

  const linkedinResults = linkedinJobs.status === 'fulfilled' ? linkedinJobs.value : []
  const museResults = museJobs.status === 'fulfilled' ? museJobs.value : []
  const arbeitnowResults = arbeitnowJobs.status === 'fulfilled' ? arbeitnowJobs.value : []

  if (linkedinJobs.status === 'rejected') console.warn(`[sourcing-worker] LinkedIn failed for "${keywords}": ${linkedinJobs.reason?.message}`)
  if (museJobs.status === 'rejected') console.warn(`[sourcing-worker] The Muse failed for "${keywords}": ${museJobs.reason?.message}`)
  if (arbeitnowJobs.status === 'rejected') console.warn(`[sourcing-worker] Arbeitnow failed for "${keywords}": ${arbeitnowJobs.reason?.message}`)

  // Deduplicate by normalized title+company
  const seen = new Set<string>()
  return [...linkedinResults, ...museResults, ...arbeitnowResults].filter((j) => {
    const key = `${j.title.toLowerCase().trim()}|${j.company.toLowerCase().trim()}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

// Stamp each match with (a) a real, fillable apply URL and (b) a confidence
// tier so the UI can offer Auto Apply only on jobs that are likely to succeed.
//   ready       — known ATS host (Greenhouse/Lever/Ashby/Workday/iCIMS)
//   maybe       — known aggregator we can unwrap (Built In etc.) or Indeed
//   unsupported — anything else (no URL, custom company SPA, Cloudflare-gated)
async function stampApplyUrls(matches: JobMatch[]): Promise<void> {
  for (const m of matches) {
    if (!m.link.includes('linkedin.com')) {
      // Muse / Arbeitnow / etc. — the scraped link IS the apply page.
      m.applyUrl = m.link
      m.applyTier = classifyTier(m.link)
      continue
    }
    try {
      const url = await resolveBestApplyUrl(m.title, m.company, m.location)
      if (url) {
        m.applyUrl = url
        m.applyTier = classifyTier(url)
      } else {
        m.applyTier = 'unsupported'
      }
    } catch (err: any) {
      console.warn(`[sourcing-worker] applyUrl resolve failed for "${m.title}" @ "${m.company}": ${err?.message || err}`)
      m.applyTier = 'unsupported'
    }
  }
}

interface GuestData {
  email: string
  keywords: string
  keywords2: string
  keywords3: string
  location: string
  scrapeLimit: number
  matchLimit: number
  resumeText?: string
}

async function runGuestDigest(job: Job, guest: GuestData) {
  const { email, keywords, keywords2, keywords3, location, scrapeLimit, matchLimit } = guest
  const fetchCount = scrapeLimit ?? 50
  const topCount = matchLimit ?? 5
  const keywordSets = [keywords, keywords2, keywords3].filter((kw) => kw && kw.trim())

  await progress(job, 'Starting your search…', 5)

  const sections: MatchSection[] = []

  for (let i = 0; i < keywordSets.length; i++) {
    const kw = keywordSets[i]
    const pctBase = 10 + Math.floor((i / keywordSets.length) * 70)

    await progress(job, `Scraping for "${kw}"…`, pctBase, `Search ${i + 1} of ${keywordSets.length}`)
    const scraped = await scrapeForKeywords(kw, location, fetchCount)

    if (scraped.length === 0) {
      sections.push({ searchTitle: kw, matches: [] })
      continue
    }

    await progress(job, `AI matching for "${kw}"…`, pctBase + 20, `${scraped.length} jobs`)

    // Use real resume text if provided, otherwise fall back to keyword-based proxy
    const roleDescription = guest.resumeText && guest.resumeText.length > 100
      ? guest.resumeText
      : `Candidate is seeking a ${kw} position${location ? ` in ${location}` : ''}. Select the most relevant and high-quality job listings.`

    let matches: JobMatch[]
    try {
      matches = await matchJobsToResume(roleDescription, scraped.slice(0, fetchCount), topCount)
    } catch (err: any) {
      console.warn(`[sourcing-worker] Guest AI matching failed for "${kw}": ${err?.message}`)
      sections.push({ searchTitle: kw, matches: [] })
      continue
    }

    sections.push({ searchTitle: kw, matches })
  }

  const totalMatches = sections.reduce((s, sec) => s + sec.matches.length, 0)
  if (totalMatches === 0) {
    await progress(job, 'No jobs found', 100, 'Try different keywords or location')
    return
  }

  await progress(job, 'Sending your results…', 92)

  const firstName = email.split('@')[0]
  await sendDigestEmail(email, firstName, sections, location)

  await progress(job, 'Done! Check your inbox.', 100, `Sent ${totalMatches} matches to ${email}`)
}

const worker = new Worker(
  'job-sourcing',
  async (job) => {
    const data = job.data as { userId?: string; manual?: boolean; guest?: GuestData }

    if (data.guest) {
      await runGuestDigest(job, data.guest)
      return
    }

    const { userId, manual } = data as { userId: string; manual?: boolean }

    await progress(job, 'Loading your profile…', 5)

    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { profile: true, preference: true },
    })

    if (!user) throw new Error('User not found')

    if (!user.preference?.keywords) {
      await progress(job, 'Skipped — no keywords set', 100, 'Set job keywords in AI Matches')
      return
    }
    if (!manual && !user.preference.emailEnabled) {
      await progress(job, 'Skipped — digest is disabled', 100, 'Enable it in preferences')
      return
    }
    if (!user.profile?.resumePath) {
      await progress(job, 'Skipped — no resume found', 100, 'Upload your resume first')
      return
    }
    if (!user.profile.resumeText) {
      await progress(job, 'Skipped — resume text missing', 100, 'Re-upload your resume PDF so text can be extracted')
      return
    }

    const { keywords, keywords2, keywords3, location, scrapeLimit, matchLimit } = user.preference
    const fetchCount = scrapeLimit ?? 50
    const topCount = matchLimit ?? 5

    // Collect active keyword sets (up to 3)
    const keywordSets = [keywords, keywords2, keywords3].filter((kw) => kw && kw.trim())

    const recentHistory = await prisma.jobMatchHistory.findMany({
      where: { userId, runDate: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } },
      select: { jobLinks: true },
    })
    const sentLinks = new Set(recentHistory.flatMap((h) => h.jobLinks))

    const sections: MatchSection[] = []
    const allLinks: string[] = []

    for (let i = 0; i < keywordSets.length; i++) {
      const kw = keywordSets[i]
      const pctBase = 10 + Math.floor((i / keywordSets.length) * 70)

      await progress(job, `Scraping for "${kw}"…`, pctBase, `Search ${i + 1} of ${keywordSets.length}`)

      const scraped = await scrapeForKeywords(kw, location, fetchCount)

      if (scraped.length === 0) {
        sections.push({ searchTitle: kw, matches: [] })
        continue
      }

      await progress(job, `Filtering duplicates for "${kw}"…`, pctBase + 10)

      const freshJobs = scraped.filter((j) => !sentLinks.has(j.link))
      const jobsToMatch = freshJobs.length >= topCount ? freshJobs : scraped

      await progress(job, `AI matching for "${kw}"…`, pctBase + 20, `${jobsToMatch.length} jobs`)

      let matches: JobMatch[]
      try {
        matches = await matchJobsToResume(user.profile!.resumeText!, jobsToMatch, topCount)
      } catch (err: any) {
        console.warn(`[sourcing-worker] AI matching failed for "${kw}": ${err?.message}`)
        sections.push({ searchTitle: kw, matches: [] })
        continue
      }

      await progress(job, `Resolving apply links for "${kw}"…`, pctBase + 25, `${matches.length} matches`)
      await stampApplyUrls(matches)

      sections.push({ searchTitle: kw, matches })
      allLinks.push(...matches.map((m) => m.link))
      // Add matched links to sentLinks so subsequent searches don't repeat
      matches.forEach((m) => sentLinks.add(m.link))
    }

    const totalMatches = sections.reduce((s, sec) => s + sec.matches.length, 0)
    if (totalMatches === 0) {
      await progress(job, 'No jobs found today', 100, 'Try different keywords or location')
      return
    }

    await progress(job, 'Saving results…', 85, `${totalMatches} total matches across ${keywordSets.length} search(es)`)

    await prisma.jobMatchHistory.create({
      data: {
        userId,
        jobLinks: allLinks,
        topMatches: sections as any,
      },
    })

    await progress(job, 'Sending email…', 92)

    await sendDigestEmail(
      user.email,
      user.profile.firstName || user.email.split('@')[0],
      sections,
      location
    )

    await progress(job, 'Done! Check your inbox.', 100, `Sent ${totalMatches} matches to ${user.email}`)
  },
  { connection, concurrency: 5 }
)

worker.on('failed', (job, err) => {
  console.error(`[sourcing-worker] Job failed (userId=${job?.data?.userId}):`, err)
})

worker.on('error', (err) => {
  console.error('[sourcing-worker] Worker error:', err)
})

export default worker
