import 'dotenv/config'
import { Worker } from 'bullmq'
import { connection } from '../lib/queue'
import { searchJobs, formatSalary } from '../lib/jsearch'
import prisma from '../lib/prisma'

const JOBS_PER_PREFERENCE = 10

function log(msg: string) {
  console.log(`[job-refresh] ${new Date().toISOString()} ${msg}`)
}

const worker = new Worker(
  'job-refresh',
  async () => {
    log('━━━ Weekly job refresh started ━━━')
    const startedAt = Date.now()

    // Collect all unique keyword+location pairs from user preferences
    const prefs = await prisma.jobPreference.findMany({
      where: { keywords: { not: '' } },
      select: { keywords: true, location: true },
    })

    const seen = new Set<string>()
    const uniquePrefs = prefs.filter((p) => {
      const key = `${p.keywords.toLowerCase()}|${p.location.toLowerCase()}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })

    log(`Found ${uniquePrefs.length} unique preference(s) across ${prefs.length} user(s)`)

    if (uniquePrefs.length === 0) {
      log('No user preferences set — skipping')
      return
    }

    let totalFetched = 0
    let totalUpserted = 0
    let totalFailed = 0

    for (let i = 0; i < uniquePrefs.length; i++) {
      const pref = uniquePrefs[i]
      const query = pref.location ? `${pref.keywords} in ${pref.location}` : pref.keywords
      log(`[${i + 1}/${uniquePrefs.length}] Fetching: "${query}"`)

      try {
        const rawJobs = await searchJobs({ q: query, num_pages: 1, date_posted: 'week' })
        const slice = rawJobs.slice(0, JOBS_PER_PREFERENCE)
        totalFetched += slice.length
        log(`  → ${rawJobs.length} results from API, taking top ${slice.length}`)

        let newCount = 0
        let updatedCount = 0

        await Promise.all(
          slice.map(async (j) => {
            const existing = await prisma.job.findUnique({ where: { externalId: j.job_id }, select: { id: true } })
            await prisma.job.upsert({
              where: { externalId: j.job_id },
              update: { fetchedAt: new Date() },
              create: {
                externalId: j.job_id,
                title: j.job_title,
                company: j.employer_name,
                location: [j.job_city, j.job_state, j.job_country].filter(Boolean).join(', '),
                description: j.job_description || '',
                url: j.job_apply_link,
                source: j.job_source || 'JSearch',
                salary: formatSalary(j),
                jobType: j.job_employment_type,
                isRemote: j.job_is_remote,
                postedAt: j.job_posted_at_datetime_utc ? new Date(j.job_posted_at_datetime_utc) : null,
              },
            })
            if (existing) updatedCount++ else newCount++
          })
        )

        totalUpserted += slice.length
        log(`  ✓ ${newCount} new, ${updatedCount} updated`)
      } catch (err: any) {
        totalFailed++
        log(`  ✗ Failed: ${err?.message || err}`)
      }
    }

    const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1)
    log(`━━━ Done in ${elapsed}s — ${totalFetched} fetched, ${totalUpserted} upserted, ${totalFailed} failed ━━━`)
  },
  { connection, concurrency: 1 }
)

worker.on('active', () => log('Worker picked up a job'))
worker.on('failed', (_job: any, err: any) => log(`Job failed: ${err?.message}`))
worker.on('error', (err: any) => log(`Worker error: ${err?.message}`))

export default worker
