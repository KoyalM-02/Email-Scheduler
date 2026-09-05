import { createHash, randomUUID } from 'node:crypto';
import type { Request, Response } from 'express';
import { EmailStatus } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../config/prisma.js';
import { emailQueue } from '../queues/email.queue.js';
import { indexEmail, searchEmails } from '../services/search.service.js';

const scheduleSchema=z.object({ sender:z.string().email(), subject:z.string().min(1).max(500), body:z.string().min(1), recipients:z.array(z.string().email()).min(1).max(10000), scheduledAt:z.string().datetime(), campaignId:z.string().optional() });
const userFrom=(req:Request)=>({ id:String(req.header('x-user-id')||'demo-user'), email:String(req.header('x-user-email')||'demo@example.com'), name:req.header('x-user-name')||'Demo User' });
async function getUser(req:Request) { const u=userFrom(req); return prisma.user.upsert({where:{email:u.email},update:{name:u.name},create:u}); }
const jobId=(userId:string, recipient:string, at:string, campaign:string)=>createHash('sha256').update(`${userId}:${recipient}:${at}:${campaign}`).digest('hex');

export async function scheduleEmails(req:Request,res:Response) {
  const input=scheduleSchema.parse(req.body); const user=await getUser(req); const when=new Date(input.scheduledAt); const campaign=input.campaignId||randomUUID();
  const records=[];
  for(const recipient of [...new Set(input.recipients.map(x=>x.toLowerCase()))]) {
    const id=jobId(user.id,recipient,when.toISOString(),campaign);
    const email=await prisma.email.upsert({ where:{jobId:id}, update:{}, create:{jobId:id,campaignId:campaign,userId:user.id,sender:input.sender,recipient,subject:input.subject,body:input.body,scheduledAt:when,status:EmailStatus.SCHEDULED} });
    // BullMQ's deterministic jobId makes retries of this HTTP request idempotent.
    await emailQueue.add('deliver-email',{emailId:email.id,userId:user.id,sender:email.sender,recipient,subject:email.subject,body:email.body,scheduledAt:when.toISOString()},{jobId:id,delay:Math.max(0,when.getTime()-Date.now()),attempts:3,backoff:{type:'exponential',delay:5000},removeOnComplete:1000,removeOnFail:5000});
    await indexEmail(email); records.push(email);
  }
  res.status(201).json({campaignId:campaign,scheduled:records.length,emails:records});
}
export async function listEmails(req:Request,res:Response) { const user=await getUser(req); const status=req.query.status as EmailStatus|undefined; const items=await prisma.email.findMany({where:{userId:user.id,...(status?{status}:{})},orderBy:{scheduledAt:'desc'},take:200}); res.json(items); }
export async function search(req:Request,res:Response) { const page=Math.max(1,Number(req.query.page)||1); res.json(await searchEmails(String(req.query.q||''),req.query.status as string|undefined,page)); }
export async function connectSlack(req:Request,res:Response) { const body=z.object({webhookUrl:z.string().url()}).parse(req.body); const user=await getUser(req); await prisma.user.update({where:{id:user.id},data:{slackWebhookUrl:body.webhookUrl}}); res.status(204).end(); }
