import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import path from 'path'

import authRoutes from './routes/auth'
import jobsRoutes from './routes/jobs'
import applyRoutes from './routes/apply'
import applicationsRoutes from './routes/applications'
import profileRoutes from './routes/profile'
import preferencesRoutes from './routes/preferences'
import matchesRoutes from './routes/matches'
import adminRoutes from './routes/admin'
import helpRoutes from './routes/help'
import billingRoutes, { handleStripeWebhook } from './routes/billing'
import { initScheduler } from './scheduler'

const app = express()
const PORT = process.env.PORT || 3001

app.use(cors({ origin: process.env.CLIENT_URL || 'http://localhost:5173', credentials: true }))

// Stripe webhook MUST receive the raw body so the signature can be verified.
// Mount it BEFORE express.json() so the body parser doesn't consume the stream.
app.post('/api/billing/webhook', express.raw({ type: 'application/json' }), handleStripeWebhook)

app.use(express.json())
app.use(express.urlencoded({ extended: true }))

// Serve uploaded files (resumes) statically — restricted; auth check done in route
app.use('/uploads', express.static(path.resolve(process.env.UPLOAD_DIR || './uploads')))

// Routes
app.use('/api/auth', authRoutes)
app.use('/api/jobs', jobsRoutes)
app.use('/api/apply', applyRoutes)
app.use('/api/applications', applicationsRoutes)
app.use('/api/profile', profileRoutes)
app.use('/api/preferences', preferencesRoutes)
app.use('/api/matches', matchesRoutes)
app.use('/api/admin', adminRoutes)
app.use('/api/help', helpRoutes)
app.use('/api/billing', billingRoutes)

app.get('/api/health', (_req, res) => res.json({ status: 'ok' }))

// Return JSON 404 for any unmatched /api/* route — prevents index.html being served as JSON
app.use('/api', (_req, res) => res.status(404).json({ error: 'API route not found' }))

// Serve React build in production — client/dist sits two levels above dist/index.js
if (process.env.NODE_ENV === 'production') {
  const clientDist = path.resolve(__dirname, '../../client/dist')
  app.use(express.static(clientDist))
  app.get('*splat', (_req, res) => res.sendFile(path.join(clientDist, 'index.html')))
}

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`)
  initScheduler().catch((err) => console.error('[scheduler] Init failed:', err))
})

export default app
