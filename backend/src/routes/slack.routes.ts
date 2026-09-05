import { Router } from 'express';
import { disconnectSlack, slackCallback, startSlackOAuth } from '../controllers/slack.controller.js';
import { requireGoogleAuth } from '../middleware/auth.js';
import { asyncRoute } from '../middleware/async.js';

export const slackRouter = Router();

slackRouter.get('/connect', requireGoogleAuth, asyncRoute(startSlackOAuth));
slackRouter.get('/callback', asyncRoute(slackCallback));
slackRouter.delete('/disconnect', requireGoogleAuth, asyncRoute(disconnectSlack));
