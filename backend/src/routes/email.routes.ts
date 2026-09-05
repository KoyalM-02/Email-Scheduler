import { Router } from 'express';
import { connectSlack, listEmails, scheduleEmails, search } from '../controllers/email.controller.js';
export const emailRouter=Router();
emailRouter.get('/',listEmails); emailRouter.get('/search',search); emailRouter.post('/schedule',scheduleEmails); emailRouter.post('/slack/connect',connectSlack);
