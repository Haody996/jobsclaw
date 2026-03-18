import { Router, Response } from 'express'
import { authMiddleware, AuthRequest } from '../middleware/auth'
import { applyQueue } from '../lib/queue'
import { computeMatchScore } from '../lib/keyword-match'
import prisma from '../lib/prisma'

const router = Router()

// POST /api/apply
router.post('/', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  const { jobId, skipQueue } = req.body

  if (!jobId) {
    res.status(400).json({ error: 'jobId is required' })
    return
  }

  // Check profile has a resume
  const profile = await prisma.profile.findUnique({
    where: { userId: req.userId! },
  })

  if (!profile?.resumePath) {
    res.status(400).json({ error: 'Please upload your resume in your profile before applying' })
    return
  }

  // Check job exists
  const job = await prisma.job.findUnique({ where: { id: jobId } })
  if (!job) {
    res.status(404).json({ error: 'Job not found' })
    return
  }

  // Check if already applied
  const existing = await prisma.application.findFirst({
    where: { userId: req.userId!, jobId },
  })
  if (existing) {
    res.status(409).json({ error: 'Already applied to this job', applicationId: existing.id })
    return
  }

  const matchScore = profile.resumeText
    ? computeMatchScore(job.description, profile.resumeText)
    : null

  // Create application record
  const application = await prisma.application.create({
    data: {
      userId: req.userId!,
      jobId,
      status: 'PENDING',
      matchScore,
    },
  })

  // Add to queue unless caller is handling it manually (tab mode)
  if (!skipQueue) {
    await applyQueue.add('apply', {
      applicationId: application.id,
      jobId,
      userId: req.userId!,
    })
  }

  res.status(201).json({ applicationId: application.id, status: 'PENDING' })
})

export default router
