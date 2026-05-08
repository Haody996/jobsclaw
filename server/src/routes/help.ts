import { Router } from 'express'
import prisma from '../lib/prisma'
import { optionalAuth, type AuthRequest } from '../middleware/auth'
import { sendHelpRequestEmail } from '../lib/send-email'

const router = Router()

router.post('/', optionalAuth, async (req: AuthRequest, res) => {
  const { email, message } = req.body
  const userId = req.userId

  if (!email || typeof email !== 'string' || !email.includes('@')) {
    return res.status(400).json({ error: 'Valid email is required' })
  }
  if (!message || typeof message !== 'string' || message.trim().length < 5) {
    return res.status(400).json({ error: 'Message must be at least 5 characters' })
  }

  const helpRequest = await prisma.helpRequest.create({
    data: {
      email: email.trim(),
      message: message.trim(),
      userId: userId || null,
    },
  })

  try {
    await sendHelpRequestEmail(email.trim(), message.trim(), userId)
  } catch (err) {
    console.warn('[help] Email send failed:', err)
  }

  res.json({ id: helpRequest.id })
})

export default router
