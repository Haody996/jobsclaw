import { Router } from 'express'
import { authMiddleware, AuthRequest } from '../middleware/auth'
import prisma from '../lib/prisma'
import { scheduleUserDigest, unscheduleUserDigest, sourcingQueue } from '../scheduler'

const router = Router()

// GET /api/preferences — fetch current user's job preferences
router.get('/', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const pref = await prisma.jobPreference.findUnique({ where: { userId: req.userId! } })
    res.json({
      preference: pref ?? {
        keywords: '',
        location: '',
        dailyEmailTime: '09:00',
        emailEnabled: false,
      },
    })
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch preferences' })
  }
})

// PUT /api/preferences — save preferences + update schedule
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
  } catch (err) {
    res.status(500).json({ error: 'Failed to save preferences' })
  }
})

// POST /api/preferences/trigger — send digest immediately (for testing)
router.post('/trigger', authMiddleware, async (req: AuthRequest, res) => {
  try {
    await sourcingQueue.add('send-digest', { userId: req.userId! }, {
      jobId: `manual-${req.userId!}-${Date.now()}`,
    })
    res.json({ message: 'Digest queued — check your email in a few moments.' })
  } catch (err) {
    res.status(500).json({ error: 'Failed to queue digest' })
  }
})

export default router
