import { Queue } from 'bullmq'
import { connection } from './lib/queue'
import prisma from './lib/prisma'

export const sourcingQueue = new Queue('job-sourcing', { connection })

// Convert "HH:mm" → cron expression "m H * * *"
function timeToCron(time: string): string {
  const [h, m] = time.split(':')
  return `${parseInt(m, 10)} ${parseInt(h, 10)} * * *`
}

export async function scheduleUserDigest(userId: string, dailyEmailTime: string): Promise<void> {
  const cron = timeToCron(dailyEmailTime)
  await sourcingQueue.upsertJobScheduler(
    `digest-${userId}`,
    { pattern: cron, tz: 'UTC' },
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
  console.log(`[scheduler] Initialized — ${prefs.length} digest(s) scheduled`)
}
