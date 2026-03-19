import 'dotenv/config'
import { Worker, Job } from 'bullmq'
import { connection } from '../lib/queue'
import prisma from '../lib/prisma'
import { scrapeLinkedInJobs } from '../lib/scrape-linkedin'
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

    const { keywords, location } = user.preference

    await progress(job, 'Scraping LinkedIn…', 20, `"${keywords}" in "${location}"`)

    let scraped
    try {
      scraped = await scrapeLinkedInJobs(keywords, location)
    } catch (err: any) {
      throw new Error(`LinkedIn scrape failed: ${err?.message}`)
    }

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
    const jobsToMatch = freshJobs.length >= 5 ? freshJobs : scraped

    await progress(job, 'AI matching your resume…', 60, `Analysing ${jobsToMatch.length} jobs with Claude`)

    let matches
    try {
      matches = await matchJobsToResume(user.profile.resumeText, jobsToMatch)
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
      user.profile.firstName || 'there',
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
