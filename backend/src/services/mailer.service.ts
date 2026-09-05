import nodemailer from 'nodemailer';
import { env } from '../config/env.js';
type SmtpAccount={email:string;host:string;port:number;user:string;pass:string};
const accounts:SmtpAccount[]=JSON.parse(env.SMTP_ACCOUNTS_JSON);
const fallback:SmtpAccount={email:env.SMTP_FROM,host:env.SMTP_HOST,port:env.SMTP_PORT,user:env.SMTP_USER,pass:env.SMTP_PASS};
const transporters=new Map<string,nodemailer.Transporter>();
function accountFor(sender:string) { return accounts.find(a=>a.email.toLowerCase()===sender.toLowerCase()) || fallback; }
function transporterFor(account:SmtpAccount) { const key=account.email; let transporter=transporters.get(key); if(!transporter){transporter=nodemailer.createTransport({host:account.host,port:account.port,secure:account.port===465,auth:{user:account.user,pass:account.pass}});transporters.set(key,transporter);} return transporter; }
export function availableSenders() { return [...new Set([fallback.email,...accounts.map(a=>a.email)])]; }
export async function deliverEmail(data:{sender:string;recipient:string;subject:string;body:string}) { const account=accountFor(data.sender); return transporterFor(account).sendMail({ from:data.sender || account.email, to:data.recipient, subject:data.subject, html:data.body }); }
