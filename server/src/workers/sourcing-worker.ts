import 'dotenv/config'
import { Worker } from 'bullmq'
import { connection } from '../lib/queue'
import prisma from '../lib/prisma'
import { scrapeLinkedInJobs } from '../lib/scrape-linkedin'
import { matchJobsToResume } from '../lib/match-jobs-llm'
import { sendDigestEmail } from '../lib/send-email'

const worker = new Worker(
  'job-sourcing',
  async (job) => {
    const { userId } = job.data as { userId: string }
    console.log(`[sourcing-worker] Running digest for user ${userId}`)

    // Load user + profile + preferences in one query
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { profile: true, preference: true },
    })

    if (!user) {
      console.warn(`[sourcing-worker] User ${userId} not found — skipping`)
      return
    }
    if (!user.preference?.emailEnabled) {
      console.log(`[sourcing-worker] Email disabled for user ${userId} — skipping`)
      return
    }
    if (!user.profile?.resumeText) {
      console.warn(`[sourcing-worker] No resume text for user ${userId} — skipping`)
      return
    }

    const { keywords, location } = user.preference

    // 1. Scrape jobs
    let scraped
    try {
      scraped = await scrapeLinkedInJobs(keywords, location)
      console.log(`[sourcing-worker] Scraped ${scraped.length} jobs for user ${userId}`)
    } catch (err) {
      console.error(`[sourcing-worker] Scrape failed for user ${userId}:`, err)
      return
    }

    if (scraped.length === 0) {
      console.log(`[sourcing-worker] No jobs found for "${keywords}" in "${location}" — skipping email`)
      return
    }

    // 2. Deduplication — filter links sent in the last 7 days
    const recentHistory = await prisma.jobMatchHistory.findMany({
      where: {
        userId,
        runDate: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
      },
      select: { jobLinks: true },
    })
    const sentLinks = new Set(recentHistory.flatMap((h) => h.jobLinks))
    const freshJobs = scraped.filter((j) => !sentLinks.has(j.link))

    // Fall back to all scraped jobs if not enough fresh ones
    const jobsToMatch = freshJobs.length >= 5 ? freshJobs : scraped

    // 3. LLM matching via Claude
    let matches
    try {
      matches = await matchJobsToResume(user.profile.resumeText, jobsToMatch)
      console.log(`[sourcing-worker] LLM selected ${matches.length} matches for user ${userId}`)
    } catch (err) {
      console.error(`[sourcing-worker] LLM matching failed for user ${userId}:`, err)
      return
    }

    // 4. Persist history to prevent duplicates
    await prisma.jobMatchHistory.create({
      data: {
        userId,
        jobLinks: matches.map((m) => m.link),
        topMatches: matches,
      },
    })

    // 5. Send digest email
    await sendDigestEmail(
      user.email,
      user.profile.firstName || 'there',
      matches,
      keywords,
      location
    )

    console.log(`[sourcing-worker] Digest sent to ${user.email}`)
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
