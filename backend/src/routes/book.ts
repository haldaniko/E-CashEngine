import { existsSync } from 'node:fs';
import path from 'node:path';
import { Router } from 'express';
import Stripe from 'stripe';
import { asyncHandler } from '../middleware/asyncHandler';
import {
  attachStripeSession,
  confirmBookOrder,
  createBookOrder,
  createDownloadToken,
  failBookOrder,
  getBookOrderBySession,
  verifyDownloadToken,
  getBookOrder,
} from '../services/bookStore';

export const bookRouter = Router();
export const bookWebhookRouter = Router();
let stripeOverride: Stripe | undefined;

export function setStripeClientForTests(client?: Stripe) {
  if (process.env.NODE_ENV !== 'test') throw new Error('Stripe test override is only available in test mode');
  stripeOverride = client;
}

function bookConfig() {
  const amountCents = Number(process.env.BOOK_PRICE_CENTS || 1900);
  if (!Number.isInteger(amountCents) || amountCents < 50) throw new Error('BOOK_PRICE_CENTS must be a valid positive integer');
  return {
    title: process.env.BOOK_TITLE || '[НАЗВАНИЕ КНИГИ]',
    author: process.env.BOOK_AUTHOR || '[ИМЯ АВТОРА]',
    amountCents,
    currency: (process.env.BOOK_CURRENCY || 'eur').toLowerCase(),
  };
}

function stripeClient() {
  if (stripeOverride) return stripeOverride;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw Object.assign(new Error('Stripe payments are not configured'), { status: 503 });
  return new Stripe(key);
}

function siteUrl() {
  return (process.env.SITE_URL || 'http://localhost:9005').replace(/\/$/, '');
}

function paymentDetails(session: Stripe.Checkout.Session) {
  return {
    paymentIntentId: typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent?.id,
    email: session.customer_details?.email || session.customer_email || null,
    amountTotal: session.amount_total,
    currency: session.currency,
  };
}

bookRouter.get('/config', (_req, res) => {
  res.json({ data: bookConfig() });
});

bookRouter.post('/checkout', asyncHandler(async (_req, res) => {
  const config = bookConfig();
  const order = createBookOrder(config.amountCents, config.currency);
  try {
    const session = await stripeClient().checkout.sessions.create({
      mode: 'payment',
      customer_creation: 'always',
      line_items: [{
        quantity: 1,
        price_data: {
          currency: config.currency,
          unit_amount: config.amountCents,
          product_data: { name: config.title, description: `Digital book by ${config.author} · PDF` },
        },
      }],
      metadata: { order_id: order.id },
      success_url: `${siteUrl()}/book/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${siteUrl()}/#book`,
    });
    if (!session.url) throw new Error('Stripe did not return a Checkout URL');
    attachStripeSession(order.id, session.id);
    res.status(201).json({ data: { checkoutUrl: session.url } });
  } catch (error) {
    failBookOrder(order.id);
    throw error;
  }
}));

bookRouter.get('/status', asyncHandler(async (req, res) => {
  const sessionId = typeof req.query.session_id === 'string' ? req.query.session_id : '';
  if (!sessionId) return res.status(400).json({ error: 'session_id is required' });
  let order = getBookOrderBySession(sessionId);
  if (!order) return res.status(404).json({ error: 'Order not found' });

  if (order.status === 'pending' && process.env.STRIPE_SECRET_KEY) {
    const session = await stripeClient().checkout.sessions.retrieve(sessionId);
    if (session.payment_status === 'paid' && session.metadata?.order_id === order.id) {
      order = confirmBookOrder(order.id, paymentDetails(session))!;
    }
  }

  const data: Record<string, unknown> = { status: order.status };
  if (order.status === 'paid') {
    const maxAge = Number(process.env.BOOK_DOWNLOAD_MAX_AGE || 86400);
    data.downloadUrl = `/api/book/download/${createDownloadToken(order.id, maxAge)}`;
    data.expiresIn = maxAge;
  }
  res.json({ data });
}));

bookRouter.get('/download/:token', (req, res, next) => {
  try {
    const orderId = verifyDownloadToken(req.params.token);
    const order = orderId ? getBookOrder(orderId) : null;
    if (!orderId || !order || order.status !== 'paid') return res.status(403).json({ error: 'This download link is invalid or has expired' });
    const filePath = path.resolve(process.env.BOOK_FILE_PATH || '/app/private/book.pdf');
    if (!existsSync(filePath)) return res.status(503).json({ error: 'The book file is not available. Please contact support.' });
    res.download(filePath, `${(process.env.BOOK_TITLE || 'digital-book').replace(/[^a-z0-9_-]+/gi, '-')}.pdf`);
  } catch (error) {
    next(error);
  }
});

bookWebhookRouter.post('/', asyncHandler(async (req, res) => {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) throw Object.assign(new Error('Stripe webhook is not configured'), { status: 503 });
  const signature = req.header('stripe-signature');
  if (!signature) return res.status(400).json({ error: 'Missing Stripe signature' });
  let event: Stripe.Event;
  try {
    event = stripeClient().webhooks.constructEvent(req.body, signature, secret);
  } catch {
    return res.status(400).json({ error: 'Invalid Stripe webhook signature' });
  }
  if (event.type === 'checkout.session.completed' || event.type === 'checkout.session.async_payment_succeeded') {
    const session = event.data.object as Stripe.Checkout.Session;
    const orderId = session.metadata?.order_id;
    if (orderId && session.payment_status === 'paid') confirmBookOrder(orderId, paymentDetails(session), { id: event.id, type: event.type });
  }
  res.json({ received: true });
}));
