import Redis from 'ioredis'
import { connection } from './queue'

const redis = new Redis(connection)

const WINDOW_MS = 24 * 60 * 60 * 1000
export const SEARCH_LIMIT = 3

export interface QuotaStatus {
  used: number
  limit: number
  remaining: number
  resetAt: number | null
}

function key(userId: string) {
  return `search_count:${userId}`
}

export async function getQuota(userId: string): Promise<QuotaStatus> {
  const k = key(userId)
  const now = Date.now()
  await redis.zremrangebyscore(k, '-inf', now - WINDOW_MS)
  const [usedRaw, oldest] = await Promise.all([
    redis.zcard(k),
    redis.zrange(k, 0, 0, 'WITHSCORES'),
  ])
  const used = Number(usedRaw)
  const oldestTs = oldest.length === 2 ? Number(oldest[1]) : null
  return {
    used,
    limit: SEARCH_LIMIT,
    remaining: Math.max(0, SEARCH_LIMIT - used),
    resetAt: oldestTs ? oldestTs + WINDOW_MS : null,
  }
}

export async function consumeSearch(userId: string): Promise<QuotaStatus | null> {
  const status = await getQuota(userId)
  if (status.remaining <= 0) return status
  const now = Date.now()
  await redis.zadd(key(userId), now, `${now}-${Math.random().toString(36).slice(2, 8)}`)
  await redis.expire(key(userId), Math.ceil((WINDOW_MS * 2) / 1000))
  return null
}
