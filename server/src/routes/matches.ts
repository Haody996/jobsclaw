import { Router } from 'express'
import { authMiddleware, AuthRequest } from '../middleware/auth'
import prisma from '../lib/prisma'

const router = Router()

// GET /api/matches — all AI-matched jobs for the current user, newest first
router.get('/', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const history = await prisma.jobMatchHistory.findMany({
      where: { userId: req.userId! },
      orderBy: { runDate: 'desc' },
    })
    res.json({ history })
  } catch {
    res.status(500).json({ error: 'Failed to fetch match history' })
  }
})

export default router
