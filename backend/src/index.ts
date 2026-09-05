import express from 'express'; import cors from 'cors';
import { createBullBoard } from '@bull-board/api'; import { BullMQAdapter } from '@bull-board/api/bullMQAdapter'; import { ExpressAdapter } from '@bull-board/express';
import { env } from './config/env.js'; import { emailQueue } from './queues/email.queue.js'; import { emailRouter } from './routes/email.routes.js'; import { errorHandler } from './middleware/error.js';
import { slackRouter } from './routes/slack.routes.js';
// Default deployment runs the consumer beside the API. It can also be deployed as a dedicated `npm run worker` process.
import './workers/email.worker.js';
const app=express(); app.use(cors({origin:env.FRONTEND_URL})); app.use(express.json({limit:'2mb'}));
const board=new ExpressAdapter(); board.setBasePath('/admin/queues'); createBullBoard({queues:[new BullMQAdapter(emailQueue)],serverAdapter:board}); app.use('/admin/queues',board.getRouter());
app.get('/health',(_,res)=>res.json({ok:true})); app.use('/api/emails',emailRouter); app.use('/api/slack',slackRouter); app.use(errorHandler); app.listen(env.PORT,()=>console.log(`API listening on :${env.PORT}`));
