import { Router, Response } from 'express'
import path from 'path'
import fs from 'fs'
import { authMiddleware, AuthRequest } from '../middleware/auth'
import { upload } from '../middleware/upload'
import { parseResumeText } from '../lib/parse-resume'
import prisma from '../lib/prisma'

const router = Router()

// GET /api/profile
router.get('/', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  const profile = await prisma.profile.findUnique({
    where: { userId: req.userId! },
  })

  const answers = await prisma.commonAnswer.findMany({
    where: { userId: req.userId! },
    orderBy: { question: 'asc' },
  })

  res.json({ profile, answers })
})

// PUT /api/profile
router.put('/', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  const { firstName, lastName, phone, address, city, state, zip, country, linkedinUrl, portfolioUrl, bio, linkedinEmail, linkedinPassword } = req.body

  const profile = await prisma.profile.upsert({
    where: { userId: req.userId! },
    update: { firstName, lastName, phone, address, city, state, zip, country, linkedinUrl, portfolioUrl, bio, linkedinEmail, linkedinPassword },
    create: {
      userId: req.userId!,
      firstName: firstName || '',
      lastName: lastName || '',
      phone, address, city, state, zip, country, linkedinUrl, portfolioUrl, bio, linkedinEmail, linkedinPassword,
    },
  })

  res.json(profile)
})

// POST /api/profile/resume
router.post('/resume', authMiddleware, upload.single('resume'), async (req: AuthRequest, res: Response): Promise<void> => {
  if (!req.file) {
    res.status(400).json({ error: 'No file uploaded' })
    return
  }

  let resumeText = ''
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { PDFParse } = require('pdf-parse') as { PDFParse: new (opts: { url: string }) => { getText(): Promise<{ text: string }> } }
    const absPath = require('path').resolve(req.file.path)
    const result = await new PDFParse({ url: `file://${absPath}` }).getText()
    resumeText = result.text
  } catch (err) {
    console.warn('PDF text extraction failed:', err)
  }

  const parsed = resumeText ? parseResumeText(resumeText) : {}

  await prisma.profile.upsert({
    where: { userId: req.userId! },
    update: { resumePath: req.file.path, resumeText: resumeText || null },
    create: { userId: req.userId!, resumePath: req.file.path, resumeText: resumeText || null },
  })

  res.json({ resumePath: req.file.path, hasText: !!resumeText, parsed })
})

// GET /api/profile/resume — download resume
router.get('/resume', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  const profile = await prisma.profile.findUnique({
    where: { userId: req.userId! },
    select: { resumePath: true },
  })

  if (!profile?.resumePath || !fs.existsSync(profile.resumePath)) {
    res.status(404).json({ error: 'No resume uploaded' })
    return
  }

  res.download(path.resolve(profile.resumePath))
})

// === Q&A Bank ===

// POST /api/profile/answers
router.post('/answers', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  const { question, answer } = req.body
  if (!question || !answer) {
    res.status(400).json({ error: 'question and answer are required' })
    return
  }

  const qa = await prisma.commonAnswer.create({
    data: { userId: req.userId!, question, answer },
  })
  res.status(201).json(qa)
})

// PUT /api/profile/answers/:id
router.put('/answers/:id', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  const { question, answer } = req.body
  const qaId = req.params.id as string

  const qa = await prisma.commonAnswer.findFirst({
    where: { id: qaId, userId: req.userId! },
  })
  if (!qa) {
    res.status(404).json({ error: 'Answer not found' })
    return
  }

  const updated = await prisma.commonAnswer.update({
    where: { id: qaId },
    data: { question, answer },
  })
  res.json(updated)
})

// DELETE /api/profile/answers/:id
router.delete('/answers/:id', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  const qaId = req.params.id as string
  const qa = await prisma.commonAnswer.findFirst({
    where: { id: qaId, userId: req.userId! },
  })
  if (!qa) {
    res.status(404).json({ error: 'Answer not found' })
    return
  }

  await prisma.commonAnswer.delete({ where: { id: qaId } })
  res.status(204).send()
})

export default router
