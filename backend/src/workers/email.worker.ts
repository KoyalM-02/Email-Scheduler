import { DelayedError, Worker } from 'bullmq';
import { EmailStatus } from '@prisma/client';
import { redis } from '../config/redis.js';
import { env } from '../config/env.js';
import { prisma } from '../config/prisma.js';
import { EMAIL_QUEUE, emailQueue } from '../queues/email.queue.js';
import { deliverEmail } from '../services/mailer.service.js';
import { indexEmail } from '../services/search.service.js';
import { notifyRateLimit } from '../services/slack.service.js';
import type { EmailJob } from '../types.js';

const nextHourDelay=()=>{const d=new Date(); d.setHours(d.getHours()+1,0,0,0); return d.getTime()-Date.now();};
async function increment(key:string) { const count=await redis.incr(key); if(count===1) await redis.expire(key,3600); return count; }
async function rateCounts(sender:string) { const hour=new Date().toISOString().slice(0,13).replace(/[-T:]/g,''); return {sender:await increment(`rate_limit:${sender}:${hour}`),global:await increment(`rate_limit:global:${hour}`)}; }
/** Atomically reserves a send slot, so concurrent workers and instances cannot burst through the provider delay. */
async function reserveSendSlot(delayMs:number){const now=Date.now();const key='send_throttle:global';const target=Number(await redis.eval("local prior=tonumber(redis.call('GET',KEYS[1]) or '0'); local now=tonumber(ARGV[1]); local gap=tonumber(ARGV[2]); local next=math.max(now,prior+gap); redis.call('SET',KEYS[1],next,'PX',7200000); return next",1,key,now,delayMs));const wait=Math.max(0,target-now);if(wait)await new Promise(resolve=>setTimeout(resolve,wait));}
export const worker=new Worker<EmailJob>(EMAIL_QUEUE,async job=>{
  const data=job.data; const counts=await rateCounts(data.sender); const senderLimit=Math.min(env.MAX_EMAILS_PER_HOUR_PER_SENDER,data.hourlyLimit||env.MAX_EMAILS_PER_HOUR_PER_SENDER);
  if(counts.sender===senderLimit || counts.global===env.MAX_EMAILS_PER_HOUR) { const owner=await prisma.user.findUnique({where:{id:data.userId}}); await notifyRateLimit(owner?.slackWebhookUrl??undefined,data.sender).catch(console.error); }
  if(counts.sender>senderLimit || counts.global>env.MAX_EMAILS_PER_HOUR) {
    const delay=nextHourDelay(); const email=await prisma.email.update({where:{id:data.emailId},data:{status:EmailStatus.RESCHEDULED_RATE_LIMIT,error:'Deferred to the next hourly rate window'}}); await indexEmail(email);
    // BullMQ keeps the same locked job and moves it back into its delayed set without counting it as a failure.
    await job.moveToDelayed(Date.now()+delay,job.token??undefined); throw new DelayedError('Hourly rate limit reached');
  }
  await reserveSendSlot(Math.max(env.MIN_SEND_DELAY_MS,data.minDelayMs));
  let email=await prisma.email.update({where:{id:data.emailId},data:{status:EmailStatus.SENDING,attempts:{increment:1}}}); await indexEmail(email);
  try { await deliverEmail(data); email=await prisma.email.update({where:{id:data.emailId},data:{status:EmailStatus.SENT,sentAt:new Date(),error:null}}); await indexEmail(email); }
  catch(error) { email=await prisma.email.update({where:{id:data.emailId},data:{status:EmailStatus.FAILED,error:error instanceof Error?error.message:'SMTP delivery failed'}}); await indexEmail(email); throw error; }
},{connection:redis,concurrency:env.WORKER_CONCURRENCY});
worker.on('ready',()=>console.log(`Email worker ready (concurrency ${env.WORKER_CONCURRENCY})`)); worker.on('error',console.error);
