import { Router } from 'express'
import { authMiddleware, AuthRequest } from '../middleware/auth'
import prisma from '../lib/prisma'
import { scheduleUserDigest, unscheduleUserDigest, sourcingQueue } from '../scheduler'
import { consumeSearch, getQuota, SEARCH_LIMIT } from '../lib/search-quota'

const router = Router()

// GET /api/preferences
router.get('/', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const pref = await prisma.jobPreference.findUnique({ where: { userId: req.userId! } })
    res.json({
      preference: pref ?? { keywords: '', keywords2: '', keywords3: '', location: '', dailyEmailTime: '09:00', emailEnabled: false, scrapeLimit: 50, matchLimit: 5 },
    })
  } catch {
    res.status(500).json({ error: 'Failed to fetch preferences' })
  }
})

// PUT /api/preferences
router.put('/', authMiddleware, async (req: AuthRequest, res) => {
  const { keywords = '', keywords2 = '', keywords3 = '', location = '', dailyEmailTime = '09:00', emailEnabled = false, scrapeLimit = 50, matchLimit = 5 } = req.body
  const sl = Math.min(100, Math.max(20, Number(scrapeLimit) || 50))
  const ml = Math.min(20, Math.max(3, Number(matchLimit) || 5))
  try {
    const pref = await prisma.jobPreference.upsert({
      where: { userId: req.userId! },
      create: { userId: req.userId!, keywords, keywords2, keywords3, location, dailyEmailTime, emailEnabled, scrapeLimit: sl, matchLimit: ml },
      update: { keywords, keywords2, keywords3, location, dailyEmailTime, emailEnabled, scrapeLimit: sl, matchLimit: ml },
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

// POST /api/preferences/trigger/guest — no auth, one-time trial send
router.post('/trigger/guest', async (req, res) => {
  const { email, keywords, keywords2 = '', keywords3 = '', location = '', scrapeLimit = 50, matchLimit = 5, resumeText = '' } = req.body
  if (!email || !keywords) {
    res.status(400).json({ error: 'email and keywords are required' })
    return
  }
  try {
    const jobId = `guest-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    await sourcingQueue.add('send-digest', {
      guest: {
        email,
        keywords,
        keywords2,
        keywords3,
        location,
        scrapeLimit: Math.min(100, Math.max(20, Number(scrapeLimit) || 50)),
        matchLimit: Math.min(20, Math.max(3, Number(matchLimit) || 5)),
        resumeText: typeof resumeText === 'string' ? resumeText.slice(0, 20000) : '',
      },
    }, { jobId })
    res.json({ jobId })
  } catch {
    res.status(500).json({ error: 'Failed to queue guest digest' })
  }
})

// GET /api/preferences/trigger/guest/:jobId — poll guest job status (no auth)
router.get('/trigger/guest/:jobId', async (req, res) => {
  try {
    const job = await sourcingQueue.getJob(String(req.params.jobId))
    if (!job) { res.status(404).json({ error: 'Job not found' }); return }
    const state = await job.getState()
    res.json({ state, progress: job.progress ?? null })
  } catch {
    res.status(500).json({ error: 'Failed to get job status' })
  }
})

// GET /api/preferences/quota — daily search quota for the current user
router.get('/quota', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.userId! }, select: { isAdmin: true } })
    if (user?.isAdmin) {
      res.json({ used: 0, limit: null, remaining: null, resetAt: null, isAdmin: true })
      return
    }
    const status = await getQuota(req.userId!)
    res.json({ ...status, isAdmin: false })
  } catch {
    res.status(500).json({ error: 'Failed to get quota' })
  }
})

// POST /api/preferences/trigger — queue an immediate digest, return jobId for polling
router.post('/trigger', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.userId! }, select: { isAdmin: true } })
    if (!user?.isAdmin) {
      const denied = await consumeSearch(req.userId!)
      if (denied) {
        res.status(429).json({
          error: `Daily search limit reached (${SEARCH_LIMIT}/day)`,
          ...denied,
        })
        return
      }
    }
    const jobId = `manual-${req.userId!}-${Date.now()}`
    await sourcingQueue.add('send-digest', { userId: req.userId!, manual: true }, { jobId })
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
