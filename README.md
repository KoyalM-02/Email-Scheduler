# Email Scheduler

A full-stack cold-email scheduler built for the ReachInbox.ai assignment. It uses BullMQ delayed jobs (never cron), PostgreSQL/Prisma for durable email history, Redis for job and rate-limit state, Elasticsearch for search, and Slack webhooks for live limit alerts.

## Quick start

1. Start infrastructure: `cd backend && docker compose up -d`.
2. Copy `backend/.env.example` to `backend/.env`, add the database URL, Google client ID, and SMTP credentials (Ethereal works well for a demo).
3. Run `npm install`, `npx prisma migrate dev`, then `npm run dev` in `backend`.
4. Copy `frontend/.env.local.example` to `frontend/.env.local`, run `npm install && npm run dev` in `frontend`.

Open the dashboard at `http://localhost:3000`, the API at `http://localhost:4000`, and Bull Board at `http://localhost:4000/admin/queues`.

## Architecture

`Next.js dashboard -> Express API -> PostgreSQL + Elasticsearch` handles scheduling and read/search views. Google OpenID Connect ID tokens are verified by Express; email records are always scoped to the signed-in user. Scheduling writes a durable `Email` record and enqueues a BullMQ job with a deterministic SHA-256 `jobId`. Redis persists delayed jobs, so restarting the API or worker does not lose scheduled work. The independent BullMQ worker sends with Nodemailer, persists the outcome, and indexes every state change.

Rate counters use `rate_limit:{sender}:{YYYYMMDDHH}` and `rate_limit:global:{YYYYMMDDHH}` with Redis `INCR` and a 3600-second TTL. Over-limit jobs use BullMQ's `moveToDelayed` path and are recorded as `RESCHEDULED_RATE_LIMIT`; they are never discarded. A Redis Lua reservation creates one distributed send slot at a time, so the minimum delay is upheld even with multiple worker instances. Campaigns may request a larger delay or lower hourly cap; environment limits remain hard maximums. When a counter reaches its threshold, the worker posts a live Slack incoming-webhook alert if the user has connected Slack.

## Environment

See `backend/.env.example` for all backend variables. Required integrations are `DATABASE_URL`, `REDIS_URL`, `ELASTICSEARCH_NODE`, `GOOGLE_CLIENT_ID`, and SMTP credentials. The frontend requires `NEXT_PUBLIC_API_URL`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, and `NEXTAUTH_SECRET`. Configure a Slack app with the `incoming-webhook` scope and set `SLACK_CLIENT_ID`, `SLACK_CLIENT_SECRET`, and `SLACK_REDIRECT_URI`; Slack's redirect URL must exactly match this value. Use `SMTP_ACCOUNTS_JSON` to configure one or more Ethereal senders.

## Persistence proof / demo checklist

Schedule a campaign several minutes ahead, restart Express and the worker, then confirm it remains in `/admin/queues` and sends once at its due time. Set a small `MAX_EMAILS_PER_HOUR_PER_SENDER`, schedule more recipients, and show the rescheduled table/status and Slack alert. Demonstrate global subject/body/recipient search after Elasticsearch indexing completes.

## Submission

Create a private GitHub repository, invite `Mitrajit` and `Yadav036`, then submit the repository and a short demo video through the supplied ClickUp form. The video should cover scheduling, persistence after restart, search, queue board, rate limiting, and Slack alerting.
