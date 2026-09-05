import { Router } from 'express';
import { listEmails, me, scheduleEmails, search, senders } from '../controllers/email.controller.js';
import { requireGoogleAuth } from '../middleware/auth.js';
export const emailRouter=Router();
emailRouter.use(requireGoogleAuth);
emailRouter.get('/',listEmails); emailRouter.get('/search',search); emailRouter.get('/me',me); emailRouter.get('/senders',senders); emailRouter.post('/schedule',scheduleEmails);
