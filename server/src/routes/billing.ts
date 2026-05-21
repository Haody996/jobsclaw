import { Router, Request, Response } from 'express'
import { authMiddleware, AuthRequest } from '../middleware/auth'
import prisma from '../lib/prisma'
import {
  stripe,
  STRIPE_PRICE_ID,
  STRIPE_WEBHOOK_SECRET,
  isStripeConfigured,
  isPaidStatus,
  PAID_DAILY_LIMIT,
  FREE_DAILY_LIMIT,
} from '../lib/stripe'

const router = Router()

// GET /api/billing/status — current user's subscription state, used by UI
router.get('/status', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.userId! },
      select: {
        subscriptionStatus: true,
        subscriptionCurrentPeriodEnd: true,
        stripeCustomerId: true,
        isAdmin: true,
      },
    })
    const isPaid = isPaidStatus(user?.subscriptionStatus)
    res.json({
      isPaid,
      isAdmin: !!user?.isAdmin,
      status: user?.subscriptionStatus ?? null,
      currentPeriodEnd: user?.subscriptionCurrentPeriodEnd ?? null,
      hasStripeCustomer: !!user?.stripeCustomerId,
      freeLimit: FREE_DAILY_LIMIT,
      paidLimit: PAID_DAILY_LIMIT,
      configured: isStripeConfigured(),
    })
  } catch {
    res.status(500).json({ error: 'Failed to load billing status' })
  }
})

// POST /api/billing/checkout — start a Stripe Checkout subscription session
router.post('/checkout', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  if (!isStripeConfigured()) {
    res.status(503).json({ error: 'Billing is not configured on the server' })
    return
  }
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.userId! },
      select: { id: true, email: true, stripeCustomerId: true, subscriptionStatus: true },
    })
    if (!user) {
      res.status(404).json({ error: 'User not found' })
      return
    }
    if (isPaidStatus(user.subscriptionStatus)) {
      res.status(409).json({ error: 'Already subscribed', alreadySubscribed: true })
      return
    }

    // Reuse the Stripe customer if we have one to avoid duplicates.
    let customerId = user.stripeCustomerId
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email,
        metadata: { userId: user.id },
      })
      customerId = customer.id
      await prisma.user.update({ where: { id: user.id }, data: { stripeCustomerId: customerId } })
    }

    const origin = (req.headers.origin as string) || process.env.CLIENT_URL || 'https://jobsclaw.net'
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: customerId,
      line_items: [{ price: STRIPE_PRICE_ID, quantity: 1 }],
      success_url: `${origin}/matches?billing=success`,
      cancel_url: `${origin}/matches?billing=cancel`,
      client_reference_id: user.id,
      allow_promotion_codes: true,
    })

    res.json({ url: session.url })
  } catch (err: any) {
    console.error('[billing] checkout error:', err?.message || err)
    res.status(500).json({ error: 'Failed to start checkout' })
  }
})

// POST /api/billing/portal — open the Stripe Customer Portal to manage subscription
router.post('/portal', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  if (!isStripeConfigured()) {
    res.status(503).json({ error: 'Billing is not configured on the server' })
    return
  }
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.userId! },
      select: { stripeCustomerId: true },
    })
    if (!user?.stripeCustomerId) {
      res.status(404).json({ error: 'No Stripe customer for this user — subscribe first.' })
      return
    }
    const origin = (req.headers.origin as string) || process.env.CLIENT_URL || 'https://jobsclaw.net'
    const session = await stripe.billingPortal.sessions.create({
      customer: user.stripeCustomerId,
      return_url: `${origin}/profile`,
    })
    res.json({ url: session.url })
  } catch (err: any) {
    console.error('[billing] portal error:', err?.message || err)
    res.status(500).json({ error: 'Failed to open billing portal' })
  }
})

// POST /api/billing/webhook — Stripe → us. MUST receive the raw body.
// Registration order in index.ts uses express.raw({ type: 'application/json' })
// on this specific path BEFORE the json body parser.
export async function handleStripeWebhook(req: Request, res: Response): Promise<void> {
  if (!STRIPE_WEBHOOK_SECRET) {
    res.status(503).send('webhook secret not configured')
    return
  }
  const sig = req.headers['stripe-signature'] as string | undefined
  if (!sig) {
    res.status(400).send('missing stripe-signature')
    return
  }
  let event: any
  try {
    event = stripe.webhooks.constructEvent(req.body as Buffer, sig, STRIPE_WEBHOOK_SECRET)
  } catch (err: any) {
    console.error('[billing:webhook] signature verification failed:', err?.message)
    res.status(400).send(`signature error: ${err?.message}`)
    return
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as any
        const userId = session.client_reference_id || session.metadata?.userId
        const customerId = typeof session.customer === 'string' ? session.customer : session.customer?.id
        const subscriptionId = typeof session.subscription === 'string' ? session.subscription : session.subscription?.id

        if (userId && customerId) {
          // Pull the live subscription so we have status + period end.
          let status: string | null = 'active'
          let periodEnd: Date | null = null
          if (subscriptionId) {
            const sub = await stripe.subscriptions.retrieve(subscriptionId)
            status = sub.status
            const item = sub.items.data[0]
            if (item?.current_period_end) periodEnd = new Date(item.current_period_end * 1000)
          }
          await prisma.user.update({
            where: { id: userId },
            data: {
              stripeCustomerId: customerId,
              subscriptionId: subscriptionId ?? null,
              subscriptionStatus: status,
              subscriptionCurrentPeriodEnd: periodEnd,
            },
          })
          console.log(`[billing:webhook] subscription activated for user=${userId} status=${status}`)
        }
        break
      }
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted': {
        const sub = event.data.object as any
        const customerId = typeof sub.customer === 'string' ? sub.customer : sub.customer.id
        const user = await prisma.user.findFirst({ where: { stripeCustomerId: customerId }, select: { id: true } })
        if (user) {
          const item = sub.items.data[0]
          const periodEnd = item?.current_period_end ? new Date(item.current_period_end * 1000) : null
          await prisma.user.update({
            where: { id: user.id },
            data: {
              subscriptionId: sub.id,
              subscriptionStatus: sub.status,
              subscriptionCurrentPeriodEnd: periodEnd,
            },
          })
          console.log(`[billing:webhook] ${event.type} → user=${user.id} status=${sub.status}`)
        }
        break
      }
      default:
        // Acknowledge but ignore other event types.
        break
    }
    res.json({ received: true })
  } catch (err: any) {
    console.error('[billing:webhook] handler error:', err?.message || err)
    res.status(500).send('webhook handler error')
  }
}

export default router
