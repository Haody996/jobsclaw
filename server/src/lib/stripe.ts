import Stripe from 'stripe'

if (!process.env.STRIPE_SECRET_KEY) {
  console.warn('[stripe] STRIPE_SECRET_KEY not set — billing routes will 503')
}

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || 'sk_test_placeholder')

export const STRIPE_PRICE_ID = process.env.STRIPE_PRICE_ID || ''
export const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || ''

export function isStripeConfigured(): boolean {
  return !!process.env.STRIPE_SECRET_KEY && !!STRIPE_PRICE_ID && !!STRIPE_WEBHOOK_SECRET
}

// Treat 'active' and 'trialing' as paid; 'past_due' is a grace period
// (Stripe will retry); 'canceled' / 'unpaid' / null are not paid.
export function isPaidStatus(status: string | null | undefined): boolean {
  return status === 'active' || status === 'trialing' || status === 'past_due'
}

export const PAID_DAILY_LIMIT = 50
export const FREE_DAILY_LIMIT = 3
