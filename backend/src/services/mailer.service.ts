import nodemailer from 'nodemailer';
import { env } from '../config/env.js';
const transporter = nodemailer.createTransport({ host:env.SMTP_HOST, port:env.SMTP_PORT, secure:env.SMTP_PORT===465, auth:{user:env.SMTP_USER, pass:env.SMTP_PASS} });
export async function deliverEmail(data:{sender:string;recipient:string;subject:string;body:string}) { return transporter.sendMail({ from:data.sender || env.SMTP_FROM, to:data.recipient, subject:data.subject, html:data.body }); }
