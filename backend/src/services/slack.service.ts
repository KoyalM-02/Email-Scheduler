import { IncomingWebhook } from '@slack/webhook';
export async function notifyRateLimit(url:string|undefined, sender:string) { if(!url) return; await new IncomingWebhook(url).send({ text:`⚠️ Hourly Rate Limit Reached for Sender: ${sender}. Remaining jobs deferred to next window.` }); }
