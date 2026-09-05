import 'dotenv/config';
import { z } from 'zod';
const schema = z.object({ PORT:z.coerce.number().default(4000), DATABASE_URL:z.string(), REDIS_URL:z.string().default('redis://localhost:6379'), ELASTICSEARCH_NODE:z.string().default('http://localhost:9200'), SMTP_HOST:z.string(), SMTP_PORT:z.coerce.number().default(587), SMTP_USER:z.string(), SMTP_PASS:z.string(), SMTP_FROM:z.string(), WORKER_CONCURRENCY:z.coerce.number().int().positive().default(5), MIN_SEND_DELAY_MS:z.coerce.number().int().nonnegative().default(2000), MAX_EMAILS_PER_HOUR:z.coerce.number().int().positive().default(1000), MAX_EMAILS_PER_HOUR_PER_SENDER:z.coerce.number().int().positive().default(100), FRONTEND_URL:z.string().default('http://localhost:3000') });
export const env = schema.parse(process.env);
