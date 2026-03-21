import { Router, Response } from 'express'
import { ApplicationStatus } from '@prisma/client'
import { authMiddleware, AuthRequest } from '../middleware/auth'
import { applyQueue } from '../lib/queue'
import prisma from '../lib/prisma'

const router = Router()

// GET /api/applications
router.get('/', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  const status = req.query.status as ApplicationStatus | undefined
  const page = String(req.query.page || '1')
  const limit = String(req.query.limit || '20')

  const where: any = { userId: req.userId! }
  if (status) where.status = status

  const [applications, total] = await Promise.all([
    prisma.application.findMany({
      where,
      include: {
        job: {
          select: {
            id: true,
            title: true,
            company: true,
            location: true,
            source: true,
            salary: true,
            jobType: true,
            isRemote: true,
            url: true,
          },
        },
      },
      orderBy: { appliedAt: 'desc' },
      skip: (parseInt(page) - 1) * parseInt(limit),
      take: parseInt(limit),
    }),
    prisma.application.count({ where }),
  ])

  // Stats
  const stats = await prisma.application.groupBy({
    by: ['status'],
    where: { userId: req.userId! },
    _count: true,
  })

  const statsMap = stats.reduce(
    (acc, s) => {
      acc[s.status] = s._count
      return acc
    },
    {} as Record<string, number>
  )

  res.json({ applications, total, page: parseInt(page), stats: statsMap })
})

// POST /api/applications/by-urls — batch lookup application status by job URLs
router.post('/by-urls', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  const { urls } = req.body as { urls: string[] }
  if (!Array.isArray(urls) || urls.length === 0) {
    res.json({ applications: {} })
    return
  }

  const apps = await prisma.application.findMany({
    where: { userId: req.userId!, job: { url: { in: urls } } },
    include: { job: { select: { url: true } } },
  })

  const map: Record<string, { id: string; status: string }> = {}
  for (const app of apps) {
    map[app.job.url] = { id: app.id, status: app.status }
  }

  res.json({ applications: map })
})

// GET /api/applications/:id
router.get('/:id', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  const appId = req.params.id as string
  const application = await prisma.application.findFirst({
    where: { id: appId, userId: req.userId! },
    include: {
      job: true,
    },
  })

  if (!application) {
    res.status(404).json({ error: 'Application not found' })
    return
  }

  res.json(application)
})

// PATCH /api/applications/:id
router.patch('/:id', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  const { notes } = req.body
  const status = req.body.status as ApplicationStatus | undefined

  const validStatuses = Object.values(ApplicationStatus)
  if (status && !validStatuses.includes(status)) {
    res.status(400).json({ error: 'Invalid status' })
    return
  }

  const appId = req.params.id as string
  const application = await prisma.application.findFirst({
    where: { id: appId, userId: req.userId! },
  })

  if (!application) {
    res.status(404).json({ error: 'Application not found' })
    return
  }

  const updated = await prisma.application.update({
    where: { id: appId },
    data: {
      ...(status && { status }),
      ...(notes !== undefined && { notes }),
    },
    include: { job: true },
  })

  res.json(updated)
})

// POST /api/applications/:id/retry
router.post('/:id/retry', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  const appId = req.params.id as string
  const application = await prisma.application.findFirst({
    where: { id: appId, userId: req.userId! },
  })

  if (!application) {
    res.status(404).json({ error: 'Application not found' })
    return
  }

  if (application.status !== 'FAILED') {
    res.status(400).json({ error: 'Only failed applications can be retried' })
    return
  }

  await prisma.application.update({
    where: { id: appId },
    data: { status: 'PENDING', errorMessage: null },
  })

  await applyQueue.add('apply', {
    applicationId: appId,
    jobId: application.jobId,
    userId: req.userId!,
  })

  res.json({ applicationId: appId, status: 'PENDING' })
})

// DELETE /api/applications/:id
router.delete('/:id', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  const appId = req.params.id as string
  const application = await prisma.application.findFirst({
    where: { id: appId, userId: req.userId! },
  })

  if (!application) {
    res.status(404).json({ error: 'Application not found' })
    return
  }

  await prisma.application.delete({ where: { id: appId } })
  res.status(204).send()
})

export default router
