import { Router, Request, Response } from 'express'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import prisma from '../lib/prisma'

const router = Router()

// POST /api/auth/register
router.post('/register', async (req: Request, res: Response): Promise<void> => {
  const { email, password } = req.body

  if (!email || !password) {
    res.status(400).json({ error: 'Email and password are required' })
    return
  }

  if (password.length < 8) {
    res.status(400).json({ error: 'Password must be at least 8 characters' })
    return
  }

  const existing = await prisma.user.findUnique({ where: { email } })
  if (existing) {
    res.status(409).json({ error: 'Email already registered' })
    return
  }

  const hashed = await bcrypt.hash(password, 12)
  const user = await prisma.user.create({
    data: {
      email,
      password: hashed,
      profile: {
        create: {
          firstName: '',
          lastName: '',
        },
      },
    },
  })

  const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET || 'secret', {
    expiresIn: '7d',
  })

  res.status(201).json({ token, user: { id: user.id, email: user.email } })
})

// POST /api/auth/login
router.post('/login', async (req: Request, res: Response): Promise<void> => {
  const { email, password } = req.body

  if (!email || !password) {
    res.status(400).json({ error: 'Email and password are required' })
    return
  }

  const user = await prisma.user.findUnique({ where: { email } })
  if (!user) {
    res.status(401).json({ error: 'Invalid credentials' })
    return
  }

  const valid = await bcrypt.compare(password, user.password)
  if (!valid) {
    res.status(401).json({ error: 'Invalid credentials' })
    return
  }

  const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET || 'secret', {
    expiresIn: '7d',
  })

  res.json({ token, user: { id: user.id, email: user.email } })
})

// GET /api/auth/me
router.get('/me', async (req: Request, res: Response): Promise<void> => {
  const header = req.headers.authorization
  if (!header?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Unauthorized' })
    return
  }
  try {
    const payload = jwt.verify(header.slice(7), process.env.JWT_SECRET || 'secret') as {
      userId: string
    }
    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
      select: { id: true, email: true, createdAt: true },
    })
    if (!user) {
      res.status(404).json({ error: 'User not found' })
      return
    }
    res.json({ user })
  } catch {
    res.status(401).json({ error: 'Invalid token' })
  }
})

export default router
