import { Router, Response } from 'express'
import { createHash } from 'crypto'
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

// POST /api/apply/quick — one-click apply from AI match (no existing Job record needed)
router.post('/quick', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  const { title, company, link, location, isEasyApply, applyUrl, skipQueue } = req.body

  if (!link) {
    res.status(400).json({ error: 'Job link is required' })
    return
  }

  const profile = await prisma.profile.findUnique({ where: { userId: req.userId! } })
  if (!profile?.resumePath) {
    res.status(400).json({ error: 'Please upload your resume in your profile before applying' })
    return
  }

  // applyUrl is the real, fillable apply URL the sourcing worker resolved for
  // this match — pass it through so the apply worker can skip re-resolving.
  const directUrl = typeof applyUrl === 'string' && applyUrl ? applyUrl : null

  // Upsert a Job record so the apply worker can use it.
  // Use a SHA-256 hash of the link to guarantee per-URL uniqueness — the
  // previous base64-truncated-to-64-chars scheme collided on every LinkedIn
  // URL (they all share the 35-char `https://www.linkedin.com/jobs/view/`
  // prefix, which fills the slice before the unique slug starts).
  const externalId = `linkedin-${createHash('sha256').update(link).digest('hex').slice(0, 32)}`
  const job = await prisma.job.upsert({
    where: { externalId },
    update: { fetchedAt: new Date(), isEasyApply: !!isEasyApply, ...(directUrl ? { applyUrl: directUrl } : {}) },
    create: {
      externalId,
      title: title || 'Unknown',
      company: company || 'Unknown',
      location: location || null,
      description: '',
      url: link,
      applyUrl: directUrl,
      source: 'linkedin',
      isEasyApply: !!isEasyApply,
    },
  })

  // Check for an existing application. A previous FAILED attempt should be
  // retryable — delete it and create a fresh one. Any other status is sticky.
  const existing = await prisma.application.findFirst({
    where: { userId: req.userId!, jobId: job.id },
  })
  if (existing && existing.status !== 'FAILED') {
    res.status(409).json({ error: 'Already applied to this job', applicationId: existing.id, status: existing.status })
    return
  }
  if (existing) {
    await prisma.application.delete({ where: { id: existing.id } })
  }

  const application = await prisma.application.create({
    data: {
      userId: req.userId!,
      jobId: job.id,
      status: 'PENDING',
      matchScore: null,
    },
  })

  if (!skipQueue) {
    await applyQueue.add('apply', {
      applicationId: application.id,
      jobId: job.id,
      userId: req.userId!,
    })
  }

  res.status(201).json({ applicationId: application.id, jobId: job.id, status: 'PENDING' })
})

export default router
