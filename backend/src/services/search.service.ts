import { elastic } from '../config/elasticsearch.js';
import type { Email } from '@prisma/client';
/** Search failures must never prevent a campaign from being scheduled or sent. */
export async function indexEmail(email: Email) {
  try {
    await elastic.index({ index:'emails', id:email.id, document:{ ...email, scheduledAt:email.scheduledAt.toISOString(), sentAt:email.sentAt?.toISOString() } });
  } catch (error) {
    console.error(`Search indexing failed for email ${email.id}; delivery will continue.`, error);
  }
}
export async function searchEmails(query:string, status?:string, page=1) { const must:any[]=[]; if(query) must.push({ multi_match:{ query, fields:['subject^3','body','recipient','sender'], fuzziness:'AUTO' } }); if(status) must.push({ term:{ status } }); const result=await elastic.search({ index:'emails', from:(page-1)*20, size:20, query:{ bool:{ must } }, sort:[{scheduledAt:'desc'}] }); return { total: typeof result.hits.total==='object' ? result.hits.total.value : result.hits.total, items: result.hits.hits.map(hit=>hit._source) }; }
