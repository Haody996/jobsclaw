import { Queue } from 'bullmq'

const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379'
const url = new URL(redisUrl)

export const connection = {
  host: url.hostname,
  port: parseInt(url.port) || 6379,
  password: url.password || undefined,
  maxRetriesPerRequest: null as null,
}

export const applyQueue = new Queue('apply-jobs', { connection })

export default applyQueue
