import { Router, Response } from 'express'
import { authMiddleware, optionalAuth, AuthRequest } from '../middleware/auth'
import { searchJobs, formatSalary } from '../lib/jsearch'
import { computeMatchScore } from '../lib/keyword-match'
import prisma from '../lib/prisma'

const router = Router()

// GET /api/jobs — public, but enriches with match score + application status if logged in
router.get('/', optionalAuth, async (req: AuthRequest, res: Response): Promise<void> => {
  const q = String(req.query.q || 'software engineer')
  const location = req.query.location ? String(req.query.location) : undefined
  const datePosted = req.query.datePosted ? String(req.query.datePosted) : undefined
  const jobType = req.query.jobType ? String(req.query.jobType) : undefined
  const remote = req.query.remote
  const page = String(req.query.page || '1')
  const minScore = req.query.minScore ? String(req.query.minScore) : undefined

  try {
    // Fetch from JSearch API
    const rawJobs = await searchJobs({
      q: location ? `${q} in ${location}` : q,
      page: parseInt(page) || 1,
      date_posted: datePosted || 'all',
      employment_types: jobType ? jobType.toUpperCase() : undefined,
      remote_jobs_only: remote === 'true',
    })

    // Upsert jobs into DB (cache them), or fall back to seeded/cached DB jobs
    let jobs
    if (rawJobs.length > 0) {
      jobs = await Promise.all(
        rawJobs.map(async (j) => {
          const salary = formatSalary(j)
          return prisma.job.upsert({
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
              salary,
              jobType: j.job_employment_type,
              isRemote: j.job_is_remote,
              postedAt: j.job_posted_at_datetime_utc ? new Date(j.job_posted_at_datetime_utc) : null,
            },
          })
        })
      )
    } else {
      // No API results — serve jobs already cached/seeded in DB
      jobs = await prisma.job.findMany({
        orderBy: { postedAt: 'desc' },
        take: 20,
      })
    }

    // Enrich with match score + application status if logged in
    let resumeText = ''
    let appliedMap = new Map<string, any>()

    if (req.userId) {
      const [profile, applications] = await Promise.all([
        prisma.profile.findUnique({ where: { userId: req.userId }, select: { resumeText: true } }),
        prisma.application.findMany({
          where: { userId: req.userId, jobId: { in: jobs.map((j) => j.id) } },
          select: { jobId: true, status: true, id: true },
        }),
      ])
      resumeText = profile?.resumeText || ''
      appliedMap = new Map(applications.map((a) => [a.jobId, a]))
    }

    const enriched = jobs.map((job) => {
      const matchScore = resumeText ? computeMatchScore(job.description, resumeText) : null
      const application = appliedMap.get(job.id)
      return { ...job, matchScore, application: application || null }
    })

    // Filter by minimum match score if requested
    const filtered =
      minScore && resumeText
        ? enriched.filter((j) => (j.matchScore || 0) >= parseInt(minScore))
        : enriched

    res.json({ jobs: filtered, total: filtered.length, page: parseInt(page) })
  } catch (err: any) {
    console.error('Jobs fetch error:', err)
    res.status(500).json({ error: 'Failed to fetch jobs', detail: err.message })
  }
})

// GET /api/jobs/:id — public
router.get('/:id', optionalAuth, async (req: AuthRequest, res: Response): Promise<void> => {
  const jobId = req.params.id as string
  const job = await prisma.job.findUnique({ where: { id: jobId } })

  if (!job) {
    res.status(404).json({ error: 'Job not found' })
    return
  }

  let matchScore = null
  let application = null

  if (req.userId) {
    const [profile, app] = await Promise.all([
      prisma.profile.findUnique({ where: { userId: req.userId }, select: { resumeText: true } }),
      prisma.application.findFirst({
        where: { jobId, userId: req.userId },
        select: { id: true, status: true, appliedAt: true, matchScore: true },
      }),
    ])
    matchScore = profile?.resumeText ? computeMatchScore(job.description, profile.resumeText) : null
    application = app
  }

  res.json({ ...job, matchScore, application })
})

export default router
