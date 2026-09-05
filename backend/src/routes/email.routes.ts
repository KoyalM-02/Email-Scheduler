import { Router } from 'express';
import { listEmails, me, scheduleEmails, search, senders } from '../controllers/email.controller.js';
import { requireGoogleAuth } from '../middleware/auth.js';
import { asyncRoute } from '../middleware/async.js';
export const emailRouter=Router();
emailRouter.use(requireGoogleAuth);
emailRouter.get('/',asyncRoute(listEmails)); emailRouter.get('/search',asyncRoute(search)); emailRouter.get('/me',asyncRoute(me)); emailRouter.get('/senders',senders); emailRouter.post('/schedule',asyncRoute(scheduleEmails));
