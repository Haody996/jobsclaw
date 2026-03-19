import { Router, Request, Response } from 'express'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { OAuth2Client } from 'google-auth-library'
import prisma from '../lib/prisma'

const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID)

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
  if (!user || !user.password) {
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

// POST /api/auth/google
router.post('/google', async (req: Request, res: Response): Promise<void> => {
  const { credential } = req.body
  if (!credential) {
    res.status(400).json({ error: 'Missing Google credential' })
    return
  }

  try {
    const ticket = await googleClient.verifyIdToken({
      idToken: credential,
      audience: process.env.GOOGLE_CLIENT_ID,
    })
    const payload = ticket.getPayload()
    if (!payload?.email) {
      res.status(401).json({ error: 'Invalid Google token' })
      return
    }

    const { email, given_name, family_name } = payload

    // Find or create user
    let user = await prisma.user.findUnique({ where: { email } })
    if (!user) {
      user = await prisma.user.create({
        data: {
          email,
          profile: {
            create: {
              firstName: given_name || '',
              lastName: family_name || '',
            },
          },
        },
      })
    }

    const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET || 'secret', {
      expiresIn: '7d',
    })

    res.json({ token, user: { id: user.id, email: user.email } })
  } catch (err: any) {
    console.error('[google-auth] Verification failed:', JSON.stringify(err), String(err))
    res.status(401).json({ error: 'Google authentication failed', detail: String(err) })
  }
})

export default router
