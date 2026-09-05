import type { Email,Status } from '../types/email';
const url=process.env.NEXT_PUBLIC_API_URL||'http://localhost:4000/api';
const headers={'Content-Type':'application/json','x-user-email':'demo@example.com','x-user-name':'Demo User'};
async function request<T>(path:string, init?:RequestInit):Promise<T>{const r=await fetch(`${url}${path}`,{...init,headers:{...headers,...init?.headers}});if(!r.ok)throw new Error((await r.json().catch(()=>({}))).error||'Request failed');return r.status===204?undefined as T:r.json();}
export const api={list:(status?:Status)=>request<Email[]>(`/emails${status?`?status=${status}`:''}`),search:(q:string,status?:string)=>request<{items:Email[]}>(`/emails/search?q=${encodeURIComponent(q)}${status?`&status=${status}`:''}`),schedule:(body:unknown)=>request('/emails/schedule',{method:'POST',body:JSON.stringify(body)}),slack:(webhookUrl:string)=>request('/emails/slack/connect',{method:'POST',body:JSON.stringify({webhookUrl})})};
