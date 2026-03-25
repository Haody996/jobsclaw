import 'dotenv/config'
import { Worker, Job } from 'bullmq'
import { connection } from '../lib/queue'
import prisma from '../lib/prisma'
import { scrapeLinkedInJobs } from '../lib/scrape-linkedin'
import { scrapeIndeedJobs } from '../lib/scrape-indeed'
import { matchJobsToResume } from '../lib/match-jobs-llm'
import { sendDigestEmail } from '../lib/send-email'

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

const worker = new Worker(
  'job-sourcing',
  async (job) => {
    const { userId, manual } = job.data as { userId: string; manual?: boolean }

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

    const { keywords, location, scrapeLimit, matchLimit } = user.preference
    const fetchCount = scrapeLimit ?? 50
    const topCount = matchLimit ?? 5

    await progress(job, 'Scraping job boards…', 15, `"${keywords}" in "${location}"`)

    // Split limit across sources: 60% LinkedIn, 40% Indeed
    const linkedinLimit = Math.ceil(fetchCount * 0.6)
    const indeedLimit = Math.ceil(fetchCount * 0.4)

    const [linkedinJobs, indeedJobs] = await Promise.allSettled([
      scrapeLinkedInJobs(keywords, location, linkedinLimit),
      scrapeIndeedJobs(keywords, location, indeedLimit),
    ])

    const linkedinResults = linkedinJobs.status === 'fulfilled' ? linkedinJobs.value : []
    const indeedResults = indeedJobs.status === 'fulfilled' ? indeedJobs.value : []

    if (linkedinJobs.status === 'rejected') {
      console.warn(`[sourcing-worker] LinkedIn scrape failed: ${linkedinJobs.reason?.message}`)
    }
    if (indeedJobs.status === 'rejected') {
      console.warn(`[sourcing-worker] Indeed scrape failed: ${indeedJobs.reason?.message}`)
    }

    const scraped = [...linkedinResults, ...indeedResults]

    await progress(job, 'Scraping complete', 30,
      `LinkedIn: ${linkedinResults.length}, Indeed: ${indeedResults.length} — ${scraped.length} total`)

    if (scraped.length === 0) {
      await progress(job, 'No jobs found today', 100, 'Try different keywords or location')
      return
    }

    await progress(job, 'Filtering duplicates…', 45, `${scraped.length} jobs scraped`)

    const recentHistory = await prisma.jobMatchHistory.findMany({
      where: { userId, runDate: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } },
      select: { jobLinks: true },
    })
    const sentLinks = new Set(recentHistory.flatMap((h) => h.jobLinks))
    const freshJobs = scraped.filter((j) => !sentLinks.has(j.link))
    const jobsToMatch = freshJobs.length >= topCount ? freshJobs : scraped

    await progress(job, 'AI matching your resume…', 60, `Analysing ${jobsToMatch.length} jobs with AI`)

    let matches
    try {
      matches = await matchJobsToResume(user.profile.resumeText, jobsToMatch, topCount)
    } catch (err: any) {
      throw new Error(`AI matching failed: ${err?.message}`)
    }

    await progress(job, 'Saving results…', 85, `${matches.length} top matches selected`)

    await prisma.jobMatchHistory.create({
      data: {
        userId,
        jobLinks: matches.map((m) => m.link),
        topMatches: matches as any,
      },
    })

    await progress(job, 'Sending email…', 92)

    await sendDigestEmail(
      user.email,
      user.profile.firstName || user.email.split('@')[0],
      matches,
      keywords,
      location
    )

    await progress(job, 'Done! Check your inbox.', 100, `Sent ${matches.length} matches to ${user.email}`)
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
