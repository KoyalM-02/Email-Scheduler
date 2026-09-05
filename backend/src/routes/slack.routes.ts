import { Router } from 'express';
import { disconnectSlack, slackCallback, startSlackOAuth } from '../controllers/slack.controller.js';
import { requireGoogleAuth } from '../middleware/auth.js';

export const slackRouter = Router();

slackRouter.get('/connect', requireGoogleAuth, startSlackOAuth);
slackRouter.get('/callback', slackCallback);
slackRouter.delete('/disconnect', requireGoogleAuth, disconnectSlack);
