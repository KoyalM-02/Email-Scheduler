# Email Scheduler

A full-stack cold-email scheduler built for the ReachInbox.ai assignment. It uses BullMQ delayed jobs (never cron), PostgreSQL/Prisma for durable email history, Redis for job and rate-limit state, Elasticsearch for search, and Slack webhooks for live limit alerts.

## Prerequisites

- Node.js 20 or newer
- Docker Desktop (for PostgreSQL, Redis, and Elasticsearch)
- A Google OAuth client for dashboard sign-in
- An email provider for delivery: Ethereal/Gmail SMTP, Resend, or the built-in demo provider

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

## Email provider setup

The backend supports three delivery modes through `EMAIL_PROVIDER`:

- `smtp`: sends through the configured SMTP server. Ethereal is useful for local testing; Gmail SMTP requires an app password.
- `resend`: sends through the Resend HTTPS API. `RESEND_FROM` must use a verified Resend domain.
- `demo`: marks queued emails as `SENT` without external delivery. Use this only for a presentation or workflow demo.

For a real SMTP provider, set these variables in `backend/.env` or the backend deployment environment:

```env
EMAIL_PROVIDER=smtp
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USER=your-smtp-user
SMTP_PASS=your-smtp-password
SMTP_FROM=Scheduler <your-authorized-sender@example.com>
SMTP_ACCOUNTS_JSON=[]
```

1. Create a test inbox at [Ethereal Email](https://ethereal.email/create).
2. Copy its SMTP host, port, username, and password into `backend/.env` as `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, and `SMTP_PASS`.
3. Set `EMAIL_PROVIDER=smtp` and set `SMTP_FROM` to an address authorized by the SMTP provider.
4. Set the same Google OAuth client ID in both `backend/.env` (`GOOGLE_CLIENT_ID`) and `frontend/.env.local` (`GOOGLE_CLIENT_ID`). Set the matching frontend Google client secret and `NEXTAUTH_SECRET` in `frontend/.env.local`.
5. To use multiple Ethereal senders, set `SMTP_ACCOUNTS_JSON` to an array of `{ "email", "host", "port", "user", "pass" }` objects.

For Resend, verify a domain first, then configure:

```env
EMAIL_PROVIDER=resend
RESEND_API_KEY=re_your_api_key
RESEND_FROM=Scheduler <no-reply@your-verified-domain.com>
```

For a workflow-only demonstration without external delivery, configure `EMAIL_PROVIDER=demo`. The worker still processes the BullMQ job and persists the email as `SENT`.

Slack is optional until you demonstrate rate-limit notifications. Create a Slack app with the `incoming-webhook` scope, add `http://localhost:4000/api/slack/callback` as its OAuth redirect URL, then set `SLACK_CLIENT_ID`, `SLACK_CLIENT_SECRET`, and `SLACK_REDIRECT_URI` in `backend/.env`.

## Architecture

`Next.js dashboard -> Express API -> PostgreSQL + Elasticsearch` handles scheduling and read/search views. Google OpenID Connect ID tokens are verified by Express; email records are always scoped to the signed-in user. Scheduling writes a durable `Email` record and enqueues a BullMQ job with a deterministic SHA-256 `jobId`. Redis persists delayed jobs, so restarting the API or worker does not lose scheduled work. The independent BullMQ worker sends with Nodemailer, persists the outcome, and indexes every state change.

Rate counters use `rate_limit:{sender}:{YYYYMMDDHH}` and `rate_limit:global:{YYYYMMDDHH}` with Redis `INCR` and a 3600-second TTL. Over-limit jobs use BullMQ's `moveToDelayed` path and are recorded as `RESCHEDULED_RATE_LIMIT`; they are never discarded. A Redis Lua reservation creates one distributed send slot at a time, so the minimum delay is upheld even with multiple worker instances. Campaigns may request a larger delay or lower hourly cap; environment limits remain hard maximums. When a counter reaches its threshold, the worker posts a live Slack incoming-webhook alert if the user has connected Slack.

## Environment

See `backend/.env.example` for all backend variables. Required integrations are `DATABASE_URL`, `REDIS_URL`, `ELASTICSEARCH_NODE`, and `GOOGLE_CLIENT_ID`; the selected delivery provider may additionally require SMTP or Resend credentials. The frontend requires `NEXT_PUBLIC_API_URL`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, and `NEXTAUTH_SECRET`. Configure a Slack app with the `incoming-webhook` scope and set `SLACK_CLIENT_ID`, `SLACK_CLIENT_SECRET`, and `SLACK_REDIRECT_URI`; Slack's redirect URL must exactly match this value.

## Render deployment

Create separate Render services from this repository. Set the backend root directory to `backend`, build command to `npm install && npm run build`, and start command to `npm start`. Set the frontend root directory to `frontend`, build command to `npm install && npm run build`, and start command to `npm start`.

Add the backend environment variables in Render rather than committing secrets. Set `FRONTEND_URL` and `CORS_ORIGINS` to the deployed frontend URL, and set the frontend's `NEXT_PUBLIC_API_URL` to the deployed backend URL followed by `/api`. PostgreSQL, Redis, and Elasticsearch must be reachable from the backend deployment.

## Implemented features

### Backend

- **Scheduler:** schedules each recipient with a BullMQ delayed job; no cron is used.
- **Persistence and idempotency:** PostgreSQL stores every email state, while Redis persists delayed BullMQ jobs. A deterministic SHA-256 job ID prevents duplicate scheduling for the same campaign/recipient/time.
- **Delivery:** supports SMTP through Nodemailer, Resend through HTTPS, and a presentation-only demo provider.
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

Use this checklist when recording the demo:

- **Scheduling:** compose a campaign, upload a CSV, choose a future start time, and show the records in Scheduled Emails.
- **Persistence after restart:** restart the API/worker before the due time, reopen Bull Board, and show that the delayed jobs remain queued and are processed once.
- **Search:** search by recipient, subject, or body and show the matching records.
- **Queue board:** open `/admin/queues` and show the delayed, active, completed, or failed BullMQ jobs.
- **Rate limiting:** set a small hourly limit, schedule more recipients than the limit, and show `RESCHEDULED_RATE_LIMIT` records.
- **Slack alerting:** connect Slack before the rate-limit test and show the incoming-webhook alert when the limit is reached.

For a quick workflow-only recording, set `EMAIL_PROVIDER=demo`; this marks processed jobs as `SENT` without delivering external email. For a real delivery demonstration, use `smtp` or `resend` with valid provider credentials.

The compose form accepts a one-column CSV, for example:

```csv
recipient
person-one@example.com
person-two@example.com
```

## Demo video

Watch the submitted walkthrough: [Email Scheduler demo recording](https://drive.google.com/file/d/1G2hndS20yFeFWoHrPidbay5lZWIHE06q/view?usp=sharing).

## Submission

Before submission, confirm that the GitHub repository is private, invite `Mitrajit` and `Yadav036` under **Settings → Collaborators**, and set the Google Drive video sharing to **Anyone with the link → Viewer**. Submit both the repository URL and the demo video URL through the supplied ClickUp form. The README link documents the video, but GitHub cannot verify collaborator invitations or ClickUp submission status.
