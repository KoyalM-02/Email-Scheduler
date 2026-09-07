import { createHash, randomUUID } from 'node:crypto';
import type { Response } from 'express';
import { EmailStatus } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../config/prisma.js';
import { env } from '../config/env.js';
import { emailQueue } from '../queues/email.queue.js';
import { indexEmail, searchEmails } from '../services/search.service.js';
import { availableSenders } from '../services/mailer.service.js';
import type { AuthenticatedRequest } from '../middleware/auth.js';

const scheduleSchema = z.object({
  sender: z.string().email(), subject: z.string().min(1).max(500), body: z.string().min(1),
  recipients: z.array(z.string().email()).min(1).max(10_000), scheduledAt: z.string().datetime(),
  campaignId: z.string().optional(), minDelaySeconds: z.coerce.number().min(0).max(3600).default(2),
  hourlyLimit: z.coerce.number().int().positive().max(100_000).optional(),
});

const reservedRecipientDomains = new Set(['example.com', 'example.org', 'example.net', 'invalid', 'localhost']);
const isReservedRecipient = (recipient: string) => {
  const domain = recipient.slice(recipient.lastIndexOf('@') + 1).toLowerCase();
  return [...reservedRecipientDomains].some(reserved => domain === reserved || domain.endsWith(`.${reserved}`));
};

async function getUser(req: AuthenticatedRequest) {
  const auth = req.auth!;
  return prisma.user.upsert({
    where: { email: auth.email }, update: { name: auth.name, image: auth.image },
    create: { email: auth.email, name: auth.name, image: auth.image },
  });
}

const jobId = (userId: string, recipient: string, at: string, campaign: string) =>
  createHash('sha256').update(`${userId}:${recipient}:${at}:${campaign}`).digest('hex');

export async function scheduleEmails(req: AuthenticatedRequest, res: Response) {
  const input = scheduleSchema.parse(req.body);
  const recipients = [...new Set(input.recipients.map(recipient => recipient.toLowerCase()))];
  const reservedRecipients = recipients.filter(isReservedRecipient);
  if (reservedRecipients.length) {
    return res.status(400).json({ error: `Cannot schedule delivery to reserved test address(es): ${reservedRecipients.join(', ')}.` });
  }

  const user = await getUser(req);
  const when = new Date(input.scheduledAt);
  const campaign = input.campaignId || randomUUID();
  const minDelayMs = Math.max(env.MIN_SEND_DELAY_MS, input.minDelaySeconds * 1000);
  if (!availableSenders().includes(input.sender)) {
    return res.status(400).json({ error: 'No configured sender is available. Configure a verified Resend sender or working SMTP credentials.' });
  }

  const records = [];
  for (const recipient of recipients) {
    const id = jobId(user.id, recipient, when.toISOString(), campaign);
    const email = await prisma.email.upsert({
      where: { jobId: id }, update: {},
      create: {
        jobId: id, campaignId: campaign, userId: user.id, sender: input.sender, recipient,
        subject: input.subject, body: input.body, scheduledAt: when, status: EmailStatus.SCHEDULED,
        minDelayMs, hourlyLimit: input.hourlyLimit,
      },
    });
    try {
      await emailQueue.add('deliver-email', {
        emailId: email.id, userId: user.id, sender: email.sender, recipient, subject: email.subject,
        body: email.body, scheduledAt: when.toISOString(), minDelayMs: email.minDelayMs,
        hourlyLimit: email.hourlyLimit ?? undefined,
      }, {
        jobId: id, delay: Math.max(0, when.getTime() - Date.now()), attempts: 3,
        backoff: { type: 'exponential', delay: 5000 }, removeOnComplete: 1000, removeOnFail: 5000,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Queue unavailable';
      const failed = await prisma.email.update({
        where: { id: email.id }, data: { status: EmailStatus.FAILED, error: `Unable to schedule delivery: ${message}` },
      });
      await indexEmail(failed);
      throw new Error(`Unable to queue email delivery. ${message}`);
    }
    await indexEmail(email);
    records.push(email);
  }
  res.status(201).json({ campaignId: campaign, scheduled: records.length, emails: records });
}

export async function listEmails(req: AuthenticatedRequest, res: Response) {
  const user = await getUser(req);
  const status = req.query.status as EmailStatus | undefined;
  res.json(await prisma.email.findMany({ where: { userId: user.id, ...(status ? { status } : {}) }, orderBy: { scheduledAt: 'desc' }, take: 200 }));
}

export async function search(req: AuthenticatedRequest, res: Response) {
  const user = await getUser(req);
  const query = String(req.query.q || '');
  const status = req.query.status as EmailStatus | undefined;
  const page = Math.max(1, Number(req.query.page) || 1);
  try {
    const results = await searchEmails(query, status, page);
    res.json({ ...results, items: results.items.filter((item: any) => item.userId === user.id) });
  } catch (error) {
    console.error('Search service unavailable; falling back to the database.', error);
    const where = {
      userId: user.id, ...(status ? { status } : {}),
      ...(query ? { OR: [
        { subject: { contains: query, mode: 'insensitive' as const } },
        { body: { contains: query, mode: 'insensitive' as const } },
        { recipient: { contains: query, mode: 'insensitive' as const } },
        { sender: { contains: query, mode: 'insensitive' as const } },
      ] } : {}),
    };
    const [items, total] = await prisma.$transaction([
      prisma.email.findMany({ where, orderBy: { scheduledAt: 'desc' }, skip: (page - 1) * 20, take: 20 }),
      prisma.email.count({ where }),
    ]);
    res.json({ total, items });
  }
}

export async function me(req: AuthenticatedRequest, res: Response) {
  const user = await getUser(req);
  res.json({ email: user.email, name: user.name, image: user.image, slackConnected: Boolean(user.slackWebhookUrl) });
}

export function senders(_: AuthenticatedRequest, res: Response) { res.set('Cache-Control', 'no-store'); res.json(availableSenders()); }
