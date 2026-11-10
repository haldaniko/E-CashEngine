import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { database } from './db';

export type BookOrder = {
  id: string;
  stripe_session_id: string | null;
  payment_intent_id: string | null;
  customer_email: string | null;
  amount_cents: number;
  currency: string;
  status: 'pending' | 'paid' | 'failed';
  paid_at: string | null;
  created_at: string;
  updated_at: string;
};

export function createBookOrder(amountCents: number, currency: string) {
  const id = randomUUID();
  database.prepare(
    `INSERT INTO book_orders (id, amount_cents, currency) VALUES (?, ?, ?)`,
  ).run(id, amountCents, currency);
  return getBookOrder(id)!;
}

export function attachStripeSession(orderId: string, sessionId: string) {
  database.prepare(
    `UPDATE book_orders SET stripe_session_id = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?`,
  ).run(sessionId, orderId);
}

export function failBookOrder(orderId: string) {
  database.prepare(
    `UPDATE book_orders SET status = 'failed', updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ? AND status = 'pending'`,
  ).run(orderId);
}

export function getBookOrder(id: string) {
  return database.prepare('SELECT * FROM book_orders WHERE id = ?').get(id) as BookOrder | undefined;
}

export function getBookOrderBySession(sessionId: string) {
  return database.prepare('SELECT * FROM book_orders WHERE stripe_session_id = ?').get(sessionId) as BookOrder | undefined;
}

type PaymentDetails = { paymentIntentId?: string | null; email?: string | null; amountTotal?: number | null; currency?: string | null };

export function confirmBookOrder(orderId: string, details: PaymentDetails, event?: { id: string; type: string }) {
  database.exec('BEGIN IMMEDIATE');
  try {
    if (event) {
      const duplicate = database.prepare('SELECT 1 FROM stripe_events WHERE event_id = ?').get(event.id);
      if (duplicate) {
        database.exec('COMMIT');
        return getBookOrder(orderId);
      }
    }
    const order = getBookOrder(orderId);
    if (!order) throw new Error('Book order not found');
    if (details.amountTotal != null && details.amountTotal !== order.amount_cents) throw new Error('Stripe amount does not match the order');
    if (details.currency && details.currency.toLowerCase() !== order.currency.toLowerCase()) throw new Error('Stripe currency does not match the order');
    database.prepare(
      `UPDATE book_orders SET status = 'paid', payment_intent_id = COALESCE(?, payment_intent_id),
       customer_email = COALESCE(?, customer_email), paid_at = COALESCE(paid_at, strftime('%Y-%m-%dT%H:%M:%fZ','now')),
       updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?`,
    ).run(details.paymentIntentId || null, details.email || null, orderId);
    if (event) database.prepare('INSERT INTO stripe_events (event_id, event_type, order_id) VALUES (?, ?, ?)').run(event.id, event.type, orderId);
    database.exec('COMMIT');
    return getBookOrder(orderId);
  } catch (error) {
    database.exec('ROLLBACK');
    throw error;
  }
}

function signingSecret() {
  const secret = process.env.BOOK_DOWNLOAD_SECRET || process.env.JWT_SECRET;
  if (!secret) throw new Error('BOOK_DOWNLOAD_SECRET or JWT_SECRET is required');
  return secret;
}

function signature(payload: string) {
  return createHmac('sha256', signingSecret()).update(payload).digest('base64url');
}

export function createDownloadToken(orderId: string, maxAgeSeconds: number) {
  const payload = `${orderId}.${Math.floor(Date.now() / 1000) + maxAgeSeconds}`;
  return `${payload}.${signature(payload)}`;
}

export function verifyDownloadToken(token: string) {
  const [orderId, expiresRaw, supplied] = token.split('.');
  if (!orderId || !expiresRaw || !supplied || !/^\d+$/.test(expiresRaw)) return null;
  if (Number(expiresRaw) < Math.floor(Date.now() / 1000)) return null;
  const expected = signature(`${orderId}.${expiresRaw}`);
  const expectedBuffer = Buffer.from(expected);
  const suppliedBuffer = Buffer.from(supplied);
  if (expectedBuffer.length !== suppliedBuffer.length || !timingSafeEqual(expectedBuffer, suppliedBuffer)) return null;
  return orderId;
}
