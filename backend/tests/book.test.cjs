const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const express = require('express');
const request = require('supertest');

const originalCwd = process.cwd();
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ecash-book-test-'));
const privateDirectory = path.join(root, 'private');
fs.mkdirSync(privateDirectory);
const pdfPath = path.join(privateDirectory, 'book.pdf');
fs.writeFileSync(pdfPath, Buffer.from('%PDF-1.4 test-book'));
process.chdir(root);
process.env.NODE_ENV = 'test';
process.env.DATABASE_PATH = path.join(root, 'test.sqlite3');
process.env.BOOK_FILE_NAME = 'book.pdf';
process.env.BOOK_TITLE = 'Server Book';
process.env.BOOK_AUTHOR = 'Server Author';
process.env.BOOK_PRICE_CENTS = '1900';
process.env.BOOK_CURRENCY = 'eur';
process.env.BOOK_DOWNLOAD_MAX_AGE = '86400';
process.env.BOOK_DOWNLOAD_SECRET = 'a-test-download-secret-that-is-long-enough';
process.env.STRIPE_SECRET_KEY = 'sk_test_not_real';
process.env.STRIPE_WEBHOOK_SECRET = 'whsec_not_real';
process.env.SITE_URL = 'http://localhost:9005';

const { createSchema, database } = require('../dist/services/db');
const { bookRouter, bookWebhookRouter, setStripeClientForTests } = require('../dist/routes/book');
const { createBookOrder, createDownloadToken, confirmBookOrder } = require('../dist/services/bookStore');
const { errorHandler } = require('../dist/middleware/errorHandler');
createSchema();

let createdParams;
let webhookEvent;
const fakeStripe = {
  checkout: {
    sessions: {
      create: async (params) => {
        createdParams = params;
        return { id: 'cs_test_checkout', url: 'https://checkout.stripe.test/session' };
      },
      retrieve: async (id) => ({
        id,
        payment_status: 'paid',
        amount_total: 1900,
        currency: 'eur',
        payment_intent: 'pi_status',
        customer_details: { email: 'status@example.com' },
        metadata: { order_id: database.prepare('SELECT id FROM book_orders WHERE stripe_session_id = ?').get(id).id },
      }),
    },
  },
  webhooks: {
    constructEvent: (_body, signature) => {
      if (signature !== 'valid') throw new Error('bad signature');
      return webhookEvent;
    },
  },
};
setStripeClientForTests(fakeStripe);

const app = express();
app.use('/api/book/webhook', express.raw({ type: 'application/json' }), bookWebhookRouter);
app.use(express.json());
app.use('/api/book', bookRouter);
app.use(errorHandler);

after(() => {
  database.close();
  process.chdir(originalCwd);
  fs.rmSync(root, { recursive: true, force: true });
});

test('Checkout Session uses the server-side product and price', async () => {
  const response = await request(app).post('/api/book/checkout').send({ amountCents: 1, currency: 'usd', title: 'Tampered' });
  assert.equal(response.status, 201);
  assert.equal(response.body.data.checkoutUrl, 'https://checkout.stripe.test/session');
  assert.equal(createdParams.mode, 'payment');
  assert.equal(createdParams.customer_creation, 'always');
  assert.equal(createdParams.line_items[0].price_data.unit_amount, 1900);
  assert.equal(createdParams.line_items[0].price_data.currency, 'eur');
  assert.equal(createdParams.line_items[0].price_data.product_data.name, 'Server Book');
  assert.equal(createdParams.success_url, 'http://localhost:9005/book/success?session_id={CHECKOUT_SESSION_ID}');
  const order = database.prepare('SELECT * FROM book_orders WHERE stripe_session_id = ?').get('cs_test_checkout');
  assert.equal(order.status, 'pending');
  assert.equal(order.amount_cents, 1900);
});

test('signed webhook confirms an order and duplicate delivery is idempotent', async () => {
  const order = createBookOrder(1900, 'eur');
  database.prepare('UPDATE book_orders SET stripe_session_id = ? WHERE id = ?').run('cs_webhook', order.id);
  webhookEvent = {
    id: 'evt_paid_once',
    type: 'checkout.session.completed',
    data: { object: {
      payment_status: 'paid', amount_total: 1900, currency: 'eur', payment_intent: 'pi_webhook',
      customer_details: { email: 'reader@example.com' }, metadata: { order_id: order.id },
    } },
  };
  assert.equal((await request(app).post('/api/book/webhook').set('stripe-signature', 'wrong').send('{}')).status, 400);
  assert.equal((await request(app).post('/api/book/webhook').set('stripe-signature', 'valid').send('{}')).status, 200);
  assert.equal((await request(app).post('/api/book/webhook').set('stripe-signature', 'valid').send('{}')).status, 200);
  const paid = database.prepare('SELECT * FROM book_orders WHERE id = ?').get(order.id);
  assert.equal(paid.status, 'paid');
  assert.equal(paid.payment_intent_id, 'pi_webhook');
  assert.equal(paid.customer_email, 'reader@example.com');
  assert.equal(database.prepare('SELECT count(*) AS count FROM stripe_events WHERE event_id = ?').get('evt_paid_once').count, 1);
});

test('download rejects unpaid, invalid and expired tokens and serves paid PDF as an attachment', async () => {
  const pending = createBookOrder(1900, 'eur');
  const pendingToken = createDownloadToken(pending.id, 60);
  assert.equal((await request(app).get(`/api/book/download/${pendingToken}`)).status, 403);
  assert.equal((await request(app).get('/api/book/download/not-a-token')).status, 403);

  confirmBookOrder(pending.id, { amountTotal: 1900, currency: 'eur', paymentIntentId: 'pi_download' });
  const valid = await request(app).get(`/api/book/download/${createDownloadToken(pending.id, 60)}`);
  assert.equal(valid.status, 200);
  assert.match(valid.headers['content-disposition'], /^attachment;/);
  assert.equal(valid.body.toString(), '%PDF-1.4 test-book');
  assert.equal((await request(app).get(`/api/book/download/${createDownloadToken(pending.id, -1)}`)).status, 403);
});
