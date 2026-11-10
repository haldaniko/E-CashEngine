import type { AdminSettings, Post } from './domain';

export const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:4000';

export function assetUrl(path?: string | null) {
  if (!path) return '';
  if (/^https?:\/\//i.test(path)) return path;
  if (path.startsWith('/covers/') || path.startsWith('/logo') || path.startsWith('/favicon')) return path;
  return `${apiUrl}${path.startsWith('/') ? path : `/${path}`}`;
}

async function parseData<T>(response: Response): Promise<T> {
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || 'Request failed. Please try again.');
  return body.data;
}

export async function getPosts(): Promise<Post[]> {
  return parseData<Post[]>(await fetch(`${apiUrl}/api/posts`));
}

export async function getPost(slug: string): Promise<Post> {
  return parseData<Post>(await fetch(`${apiUrl}/api/posts/${slug}`));
}

export async function subscribe(email: string) {
  return parseData<{ email: string }>(
    await fetch(`${apiUrl}/api/subscribe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    }),
  );
}

export type BookConfig = { title: string; author: string; amountCents: number; currency: string };
export type BookStatus = { status: 'pending' | 'paid' | 'failed'; downloadUrl?: string; expiresIn?: number };

export async function getBookConfig() {
  return parseData<BookConfig>(await fetch(`${apiUrl}/api/book/config`));
}

export async function createBookCheckout() {
  return parseData<{ checkoutUrl: string }>(await fetch(`${apiUrl}/api/book/checkout`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{}',
  }));
}

export async function getBookStatus(sessionId: string) {
  return parseData<BookStatus>(await fetch(`${apiUrl}/api/book/status?session_id=${encodeURIComponent(sessionId)}`));
}

export async function request<T>(path: string, options: RequestInit = {}, token?: string, csrfToken?: string): Promise<T> {
  const headers = new Headers(options.headers);
  headers.set('Content-Type', 'application/json');
  if (token) headers.set('Authorization', `Bearer ${token}`);
  if (csrfToken) headers.set('x-csrf-token', csrfToken);
  return parseData<T>(
    await fetch(`${apiUrl}${path}`, {
      ...options,
      headers,
      credentials: 'include',
    }),
  );
}

export type { AdminSettings, Post };
