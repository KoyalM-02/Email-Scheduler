# Email Scheduler

A full-stack cold-email scheduler built for the ReachInbox.ai assignment. It uses BullMQ delayed jobs (never cron), PostgreSQL/Prisma for durable email history, Redis for job and rate-limit state, Elasticsearch for search, and Slack webhooks for live limit alerts.

## Deployed Link

[Email Scheduler](https://email-scheduler-cyan.vercel.app/)

## Prerequisites

- Node.js 20 or newer
- Docker Desktop (for PostgreSQL, Redis, and Elasticsearch)
- A Google OAuth client for dashboard sign-in
- An [Ethereal Email](https://ethereal.email) account for test SMTP delivery

## Run the infrastructure

```bash
cd backend
docker compose up -d
```

This starts PostgreSQL, Redis, and Elasticsearch. Check them with `docker compose ps`.

## Run the backend (Express + BullMQ worker)

```bash
cd backend
copy .env.example .env        # PowerShell: Copy-Item .env.example .env
npm install
npx prisma migrate dev
npm run dev
```

`npm run dev` starts the Express API and the BullMQ consumer. The API is available at `http://localhost:4000`; the live Bull Board queue dashboard is at `http://localhost:4000/admin/queues`.

## Run the frontend (Next.js)

In a second terminal:

```bash
cd frontend
copy .env.local.example .env.local    # PowerShell: Copy-Item .env.local.example .env.local
npm install
npm run dev
```

Open the dashboard at `http://localhost:3000`, the API at `http://localhost:4000`, and Bull Board at `http://localhost:4000/admin/queues`.

## Run the email scheduler

1. Sign in with Google.
2. Click **Compose New Email**.
3. Add content to the subject and body fields.
4. Upload a `.csv` file containing email addresses.
5. Select a schedule date and time 2–3 minutes after the current time.
6. Click **Schedule**.
7. Wait for the scheduled email to be sent, then open the **Sent Emails** tab to verify it.

## Ethereal Email and environment setup

1. Create a test inbox at [Ethereal Email](https://ethereal.email/create).
2. Copy its SMTP host, port, username, and password into `backend/.env` as `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, and `SMTP_PASS`.
3. Set `SMTP_FROM` to the Ethereal sender address. It can be either `sender@ethereal.email` or `Display Name <sender@ethereal.email>`.
4. Set the same Google OAuth client ID in both `backend/.env` (`GOOGLE_CLIENT_ID`) and `frontend/.env.local` (`GOOGLE_CLIENT_ID`). Set the matching frontend Google client secret and `NEXTAUTH_SECRET` in `frontend/.env.local`.
5. To use multiple Ethereal senders, set `SMTP_ACCOUNTS_JSON` to an array of `{ "email", "host", "port", "user", "pass" }` objects.

Slack is optional until you demonstrate rate-limit notifications. Create a Slack app with the `incoming-webhook` scope, add `http://localhost:4000/api/slack/callback` as its OAuth redirect URL, then set `SLACK_CLIENT_ID`, `SLACK_CLIENT_SECRET`, and `SLACK_REDIRECT_URI` in `backend/.env`.

## Architecture

`Next.js dashboard -> Express API -> PostgreSQL + Elasticsearch` handles scheduling and read/search views. Google OpenID Connect ID tokens are verified by Express; email records are always scoped to the signed-in user. Scheduling writes a durable `Email` record and enqueues a BullMQ job with a deterministic SHA-256 `jobId`. Redis persists delayed jobs, so restarting the API or worker does not lose scheduled work. The independent BullMQ worker sends with Nodemailer, persists the outcome, and indexes every state change.

Rate counters use `rate_limit:{sender}:{YYYYMMDDHH}` and `rate_limit:global:{YYYYMMDDHH}` with Redis `INCR` and a 3600-second TTL. Over-limit jobs use BullMQ's `moveToDelayed` path and are recorded as `RESCHEDULED_RATE_LIMIT`; they are never discarded. A Redis Lua reservation creates one distributed send slot at a time, so the minimum delay is upheld even with multiple worker instances. Campaigns may request a larger delay or lower hourly cap; environment limits remain hard maximums. When a counter reaches its threshold, the worker posts a live Slack incoming-webhook alert if the user has connected Slack.

## Environment

See `backend/.env.example` for all backend variables. Required integrations are `DATABASE_URL`, `REDIS_URL`, `ELASTICSEARCH_NODE`, `GOOGLE_CLIENT_ID`, and SMTP credentials. The frontend requires `NEXT_PUBLIC_API_URL`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, and `NEXTAUTH_SECRET`. Configure a Slack app with the `incoming-webhook` scope and set `SLACK_CLIENT_ID`, `SLACK_CLIENT_SECRET`, and `SLACK_REDIRECT_URI`; Slack's redirect URL must exactly match this value. Use `SMTP_ACCOUNTS_JSON` to configure one or more Ethereal senders.

## Implemented features

### Backend

- **Scheduler:** schedules each recipient with a BullMQ delayed job; no cron is used.
- **Persistence and idempotency:** PostgreSQL stores every email state, while Redis persists delayed BullMQ jobs. A deterministic SHA-256 job ID prevents duplicate scheduling for the same campaign/recipient/time.
- **Delivery:** supports one or multiple Ethereal SMTP sender accounts through Nodemailer.
- **Concurrency:** `WORKER_CONCURRENCY` configures parallel BullMQ processing; Redis coordinates the provider-delay slots across workers.
- **Rate limiting:** configurable global and per-sender hourly Redis counters defer overflow emails to the next hour without dropping them.
- **Search:** every state change is indexed in Elasticsearch; the email search API performs full-text search on subject, body, and recipients.
- **Queue visibility:** Bull Board is mounted at `/admin/queues`.
- **Security and notifications:** Express verifies Google ID tokens; Slack OAuth stores a webhook per user and sends live rate-limit alerts.

### Frontend

- **Login:** real Google OAuth login with name, email, avatar, and Logout.
- **Dashboard:** Scheduled, Sent, and Failed/Rescheduled views, status badges, skeleton loading, and empty states.
- **Compose:** CSV lead parsing/counting, selectable SMTP sender, subject/body, start time, campaign delay, and hourly limit controls.
- **Search and integrations:** debounced Elasticsearch-powered global search plus Connect/Disconnect Slack controls.

## Persistence proof / demo checklist

Schedule a campaign several minutes ahead, restart Express and the worker, then confirm it remains in `/admin/queues` and sends once at its due time. Set a small `MAX_EMAILS_PER_HOUR_PER_SENDER`, schedule more recipients, and show the rescheduled table/status and Slack alert. Demonstrate global subject/body/recipient search after Elasticsearch indexing completes.

## Demo video

There are two demo types for this project:

- Local demo without deployment: [Email Scheduler local demo](https://drive.google.com/file/d/10wBRLHBO0oBMSW02Oxnyp-D1UBb4CZ-o/view?usp=sharing)
- Production demo with deployment: [Email Scheduler deployed demo](https://drive.google.com/file/d/1G2hndS20yFeFWoHrPidbay5lZWIHE06q/view?usp=sharing)

## Submission

Create a private GitHub repository, invite `Mitrajit` and `Yadav036`, then submit the repository and a short demo video through the supplied ClickUp form. The video should cover scheduling, persistence after restart, search, queue board, rate limiting, and Slack alerting.
