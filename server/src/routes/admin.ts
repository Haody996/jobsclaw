import { Router } from 'express'
import { prisma } from '../lib/prisma'
import { authMiddleware as requireAuth } from '../middleware/auth'

const router = Router()

router.use(requireAuth)

// Guard: admin only
router.use(async (req: any, res, next) => {
  const user = await prisma.user.findUnique({ where: { id: req.userId }, select: { isAdmin: true } })
  if (!user?.isAdmin) return res.status(403).json({ error: 'Forbidden' })
  next()
})

router.get('/stats', async (_req, res) => {
  const now = new Date()
  const day = new Date(now); day.setDate(now.getDate() - 1)
  const week = new Date(now); week.setDate(now.getDate() - 7)
  const month = new Date(now); month.setDate(now.getDate() - 30)

  const [
    totalUsers,
    usersToday,
    usersThisWeek,
    usersThisMonth,
    totalDigestRuns,
    digestRunsThisWeek,
    usersWithDigestEnabled,
    recentUsers,
    topLocations,
    topKeywords,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({ where: { createdAt: { gte: day } } }),
    prisma.user.count({ where: { createdAt: { gte: week } } }),
    prisma.user.count({ where: { createdAt: { gte: month } } }),
    prisma.jobMatchHistory.count(),
    prisma.jobMatchHistory.count({ where: { runDate: { gte: week } } }),
    prisma.jobPreference.count({ where: { emailEnabled: true } }),
    prisma.user.findMany({
      orderBy: { createdAt: 'desc' },
      take: 20,
      select: {
        id: true,
        email: true,
        createdAt: true,
        password: true,
        preference: { select: { keywords: true, location: true, emailEnabled: true } },
        matchHistory: { select: { id: true }, orderBy: { runDate: 'desc' }, take: 1 },
      },
    }),
    // Top locations
    prisma.jobPreference.groupBy({
      by: ['location'],
      _count: { location: true },
      where: { location: { not: '' } },
      orderBy: { _count: { location: 'desc' } },
      take: 10,
    }),
    // Top keywords
    prisma.jobPreference.groupBy({
      by: ['keywords'],
      _count: { keywords: true },
      where: { keywords: { not: '' } },
      orderBy: { _count: { keywords: 'desc' } },
      take: 10,
    }),
  ])

  const users = recentUsers.map((u) => ({
    id: u.id,
    email: u.email,
    createdAt: u.createdAt,
    signupMethod: u.password ? 'Email' : 'Google',
    keywords: u.preference?.keywords || '',
    location: u.preference?.location || '',
    digestEnabled: u.preference?.emailEnabled ?? false,
    hasRunDigest: u.matchHistory.length > 0,
  }))

  res.json({
    stats: {
      totalUsers,
      usersToday,
      usersThisWeek,
      usersThisMonth,
      totalDigestRuns,
      digestRunsThisWeek,
      usersWithDigestEnabled,
    },
    users,
    topLocations: topLocations.map((l) => ({ location: l.location, count: l._count.location })),
    topKeywords: topKeywords.map((k) => ({ keywords: k.keywords, count: k._count.keywords })),
  })
})

export default router
