import nodemailer from 'nodemailer';
import { env } from '../config/env.js';
type SmtpAccount={email:string;host:string;port:number;user:string;pass:string};
const accounts:SmtpAccount[]=JSON.parse(env.SMTP_ACCOUNTS_JSON);
/** Accept both `person@example.com` and Nodemailer's `Name <person@example.com>` sender format. */
const mailbox=(value:string)=>value.match(/<([^>]+)>/)?.[1] || value.trim();
const fallback:SmtpAccount={email:mailbox(env.SMTP_FROM),host:env.SMTP_HOST,port:env.SMTP_PORT,user:env.SMTP_USER,pass:env.SMTP_PASS};
const transporters=new Map<string,nodemailer.Transporter>();
function accountFor(sender:string) { return accounts.find(a=>a.email.toLowerCase()===sender.toLowerCase()) || fallback; }
function transporterFor(account:SmtpAccount) { const key=account.email; let transporter=transporters.get(key); if(!transporter){transporter=nodemailer.createTransport({host:account.host,port:account.port,secure:account.port===465,auth:{user:account.user,pass:account.pass},connectionTimeout:10_000,greetingTimeout:10_000,socketTimeout:30_000});transporters.set(key,transporter);} return transporter; }
export function availableSenders() { return env.EMAIL_PROVIDER==='resend' ? (env.RESEND_FROM ? [mailbox(env.RESEND_FROM)] : []) : [...new Set([fallback.email,...accounts.map(a=>a.email)])]; }
async function deliverWithResend(data:{sender:string;recipient:string;subject:string;body:string}) {
  if (!env.RESEND_FROM) throw new Error('RESEND_FROM is required when Resend is enabled. Set it to an address on a domain verified in Resend, then restart the backend.');
  const from = env.RESEND_FROM;
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from, to: [data.recipient], subject: data.subject, html: data.body }),
  });
  if (!response.ok) {
    const details = await response.text();
    throw new Error(`Resend delivery failed (${response.status}): ${details}`);
  }
  return response.json();
}
export async function deliverEmail(data:{sender:string;recipient:string;subject:string;body:string}) {
  if (env.EMAIL_PROVIDER==='resend') return deliverWithResend(data);
  const account=accountFor(data.sender);
  return transporterFor(account).sendMail({ from:data.sender || account.email, to:data.recipient, subject:data.subject, html:data.body });
}
/** Log configuration faults on startup without making the API unavailable. */
export async function verifySmtpConfiguration() {
  if (env.EMAIL_PROVIDER==='resend') {
    const response = await fetch('https://api.resend.com/domains', { headers: { Authorization: `Bearer ${env.RESEND_API_KEY}` } });
    if (!response.ok) console.error(`Resend API verification failed (${response.status}).`);
    else console.log('Resend email provider verified; SMTP verification is skipped.');
    return;
  }
  const uniqueAccounts = [...new Map([fallback, ...accounts].map(account => [account.email, account])).values()];
  for (const account of uniqueAccounts) {
    try {
      await transporterFor(account).verify();
      console.log(`SMTP connection verified for ${account.email}.`);
    } catch (error) {
      console.error(`SMTP connection verification failed for ${account.email}. Scheduled emails will fail until SMTP_HOST, SMTP_PORT, SMTP_USER, and SMTP_PASS are corrected.`, error);
    }
  }
}
