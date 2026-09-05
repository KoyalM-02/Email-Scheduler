import { getSession } from 'next-auth/react';
import type { Email, Status } from '../types/email';

const url = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const session = await getSession();
  const token = session?.idToken || '';

  const r = await fetch(`${url}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...init?.headers,
    },
  });

  if (!r.ok) {
    const errData = await r.json().catch(() => ({}));
    throw new Error(errData.error || errData.message || 'Request failed');
  }

  return r.status === 204 ? (undefined as T) : r.json();
}

export const api = {
  list: (status?: Status) => request<Email[]>(`/emails${status ? `?status=${status}` : ''}`),
  search: (q: string, status?: string) => request<{ items: Email[] }>(`/emails/search?q=${encodeURIComponent(q)}${status ? `&status=${status}` : ''}`),
  schedule: (body: unknown) => request('/emails/schedule', { method: 'POST', body: JSON.stringify(body) }),
  senders: () => request<string[]>('/emails/senders'),
  me: () => request<{ email: string; name?: string; image?: string; slackConnected: boolean }>('/emails/me'),
  disconnectSlack: () => request('/slack/disconnect', { method: 'DELETE' }),
  slackStart: async () => {
    const session = await getSession();
    const token = session?.idToken || '';
    window.location.href = `${url}/slack/connect?access_token=${encodeURIComponent(token)}`;
  },
};
