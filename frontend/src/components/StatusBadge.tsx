import type { Status } from '../types/email';
const colors:Record<Status,string>={PENDING:'bg-slate-100 text-slate-700',SCHEDULED:'bg-blue-100 text-blue-700',SENDING:'bg-amber-100 text-amber-700',SENT:'bg-emerald-100 text-emerald-700',FAILED:'bg-rose-100 text-rose-700',RESCHEDULED_RATE_LIMIT:'bg-violet-100 text-violet-700'};
export function StatusBadge({status}:{status:Status}){return <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${colors[status]}`}>{status.replaceAll('_',' ')}</span>}
