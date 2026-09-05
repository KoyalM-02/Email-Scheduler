import { randomUUID } from 'node:crypto';
import type { Request, Response } from 'express';
import { env } from '../config/env.js';
import { redis } from '../config/redis.js';
import { prisma } from '../config/prisma.js';
import type { AuthenticatedRequest } from '../middleware/auth.js';

const stateKey = (state: string) => `slack_oauth_state:${state}`;

async function userFor(req: AuthenticatedRequest) {
  const email = req.auth!.email;
  const name = req.auth!.name;
  const image = req.auth!.image;

  return prisma.user.upsert({
    where: { email },
    update: { name, image },
    create: { email, name, image },
  });
}

/** Starts Slack's real OAuth flow. Slack app redirect URL must equal SLACK_REDIRECT_URI. */
export async function startSlackOAuth(req: AuthenticatedRequest, res: Response) {
  if (!env.SLACK_CLIENT_ID || !env.SLACK_CLIENT_SECRET) {
    return res.status(503).json({ error: 'Slack OAuth is not configured' });
  }

  const user = await userFor(req);
  const state = randomUUID();

  await redis.set(stateKey(state), user.id, 'EX', 600);

  const query = new URLSearchParams({
    client_id: env.SLACK_CLIENT_ID,
    redirect_uri: env.SLACK_REDIRECT_URI,
    state,
    scope: 'incoming-webhook',
  });

  res.redirect(`https://slack.com/oauth/v2/authorize?${query}`);
}

export async function slackCallback(req: Request, res: Response) {
  const code = String(req.query.code || '');
  const state = String(req.query.state || '');
  const userId = await redis.get(stateKey(state));

  await redis.del(stateKey(state));

  if (!code || !userId) {
    return res.redirect(`${env.FRONTEND_URL}?slack=failed`);
  }

  try {
    const body = new URLSearchParams({
      client_id: env.SLACK_CLIENT_ID || '',
      client_secret: env.SLACK_CLIENT_SECRET || '',
      code,
      redirect_uri: env.SLACK_REDIRECT_URI,
    });

    const response = await fetch('https://slack.com/api/oauth.v2.access', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body,
    });

    const result: any = await response.json();

    if (!result.ok || !result.incoming_webhook?.url) {
      throw new Error(result.error || 'Slack did not return a webhook');
    }

    await prisma.user.update({
      where: { id: userId },
      data: {
        slackWebhookUrl: result.incoming_webhook.url,
        slackAccessToken: result.access_token || null,
      },
    });

    res.redirect(`${env.FRONTEND_URL}?slack=connected`);
  } catch (error) {
    console.error('Slack OAuth failed', error);
    res.redirect(`${env.FRONTEND_URL}?slack=failed`);
  }
}

export async function disconnectSlack(req: AuthenticatedRequest, res: Response) {
  const user = await userFor(req);
  await prisma.user.update({
    where: { id: user.id },
    data: { slackWebhookUrl: null, slackAccessToken: null },
  });
  res.status(204).end();
}
