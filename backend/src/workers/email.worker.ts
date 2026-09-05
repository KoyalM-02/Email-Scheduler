import { Worker } from 'bullmq';
import { EmailStatus } from '@prisma/client';
import { redis } from '../config/redis.js';
import { env } from '../config/env.js';
import { prisma } from '../config/prisma.js';
import { EMAIL_QUEUE, emailQueue } from '../queues/email.queue.js';
import { deliverEmail } from '../services/mailer.service.js';
import { indexEmail } from '../services/search.service.js';
import { notifyRateLimit } from '../services/slack.service.js';
import type { EmailJob } from '../types.js';

let lastSendAt=0;
const nextHourDelay=()=>{const d=new Date(); d.setHours(d.getHours()+1,0,0,0); return d.getTime()-Date.now();};
async function incrementLimit(sender:string) { const hour=new Date().toISOString().slice(0,13).replace(/[-T:]/g,''); const key=`rate_limit:${sender}:${hour}`; const count=await redis.incr(key); if(count===1) await redis.expire(key,3600); return count; }
export const worker=new Worker<EmailJob>(EMAIL_QUEUE,async job=>{
  const data=job.data; const count=await incrementLimit(data.sender);
  if(count===env.MAX_EMAILS_PER_HOUR_PER_SENDER || count===env.MAX_EMAILS_PER_HOUR) { const owner=await prisma.user.findUnique({where:{id:data.userId}}); await notifyRateLimit(owner?.slackWebhookUrl,data.sender).catch(console.error); }
  if(count>env.MAX_EMAILS_PER_HOUR_PER_SENDER || count>env.MAX_EMAILS_PER_HOUR) {
    const delay=nextHourDelay(); const email=await prisma.email.update({where:{id:data.emailId},data:{status:EmailStatus.RESCHEDULED_RATE_LIMIT,error:'Deferred to the next hourly rate window'}}); await indexEmail(email);
    // Replace with the same deterministic id after removing the active job; no email is lost or marked failed.
    await job.remove(); await emailQueue.add('deliver-email',data,{jobId:job.id!,delay,attempts:3,backoff:{type:'exponential',delay:5000}}); return;
  }
  const wait=Math.max(0,env.MIN_SEND_DELAY_MS-(Date.now()-lastSendAt)); if(wait) await new Promise(r=>setTimeout(r,wait));
  let email=await prisma.email.update({where:{id:data.emailId},data:{status:EmailStatus.SENDING,attempts:{increment:1}}}); await indexEmail(email);
  try { await deliverEmail(data); lastSendAt=Date.now(); email=await prisma.email.update({where:{id:data.emailId},data:{status:EmailStatus.SENT,sentAt:new Date(),error:null}}); await indexEmail(email); }
  catch(error) { email=await prisma.email.update({where:{id:data.emailId},data:{status:EmailStatus.FAILED,error:error instanceof Error?error.message:'SMTP delivery failed'}}); await indexEmail(email); throw error; }
},{connection:redis,concurrency:env.WORKER_CONCURRENCY});
worker.on('ready',()=>console.log(`Email worker ready (concurrency ${env.WORKER_CONCURRENCY})`)); worker.on('error',console.error);
