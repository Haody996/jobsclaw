import { Router } from 'express'
import { authMiddleware, AuthRequest } from '../middleware/auth'
import prisma from '../lib/prisma'
import { scheduleUserDigest, unscheduleUserDigest, sourcingQueue } from '../scheduler'

const router = Router()

// GET /api/preferences
router.get('/', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const pref = await prisma.jobPreference.findUnique({ where: { userId: req.userId! } })
    res.json({
      preference: pref ?? { keywords: '', location: '', dailyEmailTime: '09:00', emailEnabled: false },
    })
  } catch {
    res.status(500).json({ error: 'Failed to fetch preferences' })
  }
})

// PUT /api/preferences
router.put('/', authMiddleware, async (req: AuthRequest, res) => {
  const { keywords = '', location = '', dailyEmailTime = '09:00', emailEnabled = false } = req.body
  try {
    const pref = await prisma.jobPreference.upsert({
      where: { userId: req.userId! },
      create: { userId: req.userId!, keywords, location, dailyEmailTime, emailEnabled },
      update: { keywords, location, dailyEmailTime, emailEnabled },
    })
    if (emailEnabled) {
      await scheduleUserDigest(req.userId!, pref.dailyEmailTime)
    } else {
      await unscheduleUserDigest(req.userId!)
    }
    res.json({ preference: pref })
  } catch {
    res.status(500).json({ error: 'Failed to save preferences' })
  }
})

// POST /api/preferences/trigger — queue an immediate digest, return jobId for polling
router.post('/trigger', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const jobId = `manual-${req.userId!}-${Date.now()}`
    await sourcingQueue.add('send-digest', { userId: req.userId! }, { jobId })
    res.json({ jobId })
  } catch {
    res.status(500).json({ error: 'Failed to queue digest' })
  }
})

// GET /api/preferences/trigger/:jobId — poll job status + progress
router.get('/trigger/:jobId', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const job = await sourcingQueue.getJob(String(req.params.jobId))
    if (!job) {
      res.status(404).json({ error: 'Job not found' })
      return
    }
    const state = await job.getState()
    res.json({ state, progress: job.progress ?? null })
  } catch {
    res.status(500).json({ error: 'Failed to get job status' })
  }
})

export default router
