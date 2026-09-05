import { Queue } from 'bullmq';
import { redis } from '../config/redis.js';
import type { EmailJob } from '../types.js';
export const EMAIL_QUEUE = 'email-delivery';
export const emailQueue = new Queue<EmailJob>(EMAIL_QUEUE, { connection: redis });
