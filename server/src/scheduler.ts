import { Queue } from 'bullmq'
import { connection } from './lib/queue'
import prisma from './lib/prisma'

export const sourcingQueue = new Queue('job-sourcing', { connection })
export const jobRefreshQueue = new Queue('job-refresh', { connection })

// Convert "HH:mm" → cron expression "m H * * *"
function timeToCron(time: string): string {
  const [h, m] = time.split(':')
  return `${parseInt(m, 10)} ${parseInt(h, 10)} * * *`
}

export async function scheduleUserDigest(userId: string, dailyEmailTime: string): Promise<void> {
  const cron = timeToCron(dailyEmailTime)
  await sourcingQueue.upsertJobScheduler(
    `digest-${userId}`,
    { pattern: cron, tz: 'America/Los_Angeles' },
    { name: 'send-digest', data: { userId } }
  )
}

export async function unscheduleUserDigest(userId: string): Promise<void> {
  await sourcingQueue.removeJobScheduler(`digest-${userId}`)
}

// Called on server start — re-registers schedules for all enabled users
export async function initScheduler(): Promise<void> {
  const prefs = await prisma.jobPreference.findMany({ where: { emailEnabled: true } })
  await Promise.all(prefs.map((p) => scheduleUserDigest(p.userId, p.dailyEmailTime)))

  // Weekly job refresh — every Tuesday at 09:00 UTC
  await jobRefreshQueue.upsertJobScheduler(
    'weekly-job-refresh',
    { pattern: '0 9 * * 2', tz: 'UTC' },
    { name: 'refresh-jobs', data: {} }
  )

  console.log(`[scheduler] Initialized — ${prefs.length} digest(s) scheduled, weekly refresh set for Tue 09:00 UTC (job refresh stays UTC)`)
}
