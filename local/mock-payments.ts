/**
 * Mock Payments Service for Local Development
 * Simulates Stripe payment processing
 */

const express = require('express');
const app = express();
app.use(express.json());

const config = {
  port: parseInt(process.env.MOCK_PAYMENTS_PORT || '7002'),
  stripeMode: process.env.MOCK_STRIPE_MODE || 'test',
};

// In-memory storage
const paymentIntents = new Map();
const customers = new Map();
const subscriptions = new Map();

// Create payment intent
app.post('/v1/payment_intents', (req: any, res: any) => {
  const { amount, currency = 'usd', customer } = req.body;

  const intent = {
    id: `pi_${Date.now()}_${Math.random().toString(36).substring(7)}`,
    object: 'payment_intent',
    amount,
    currency,
    customer,
    status: 'requires_payment_method',
    client_secret: `pi_secret_${Date.now()}`,
    created: Math.floor(Date.now() / 1000),
  };

  paymentIntents.set(intent.id, intent);
  res.json(intent);
});

// Confirm payment intent
app.post('/v1/payment_intents/:id/confirm', (req: any, res: any) => {
  const { id } = req.params;
  const intent = paymentIntents.get(id);

  if (!intent) {
    return res.status(404).json({ error: { message: 'Payment intent not found' } });
  }

  intent.status = 'succeeded';
  paymentIntents.set(id, intent);

  res.json(intent);
});

// Create customer
app.post('/v1/customers', (req: any, res: any) => {
  const { email, name, metadata } = req.body;

  const customer = {
    id: `cus_${Date.now()}_${Math.random().toString(36).substring(7)}`,
    object: 'customer',
    email,
    name,
    metadata: metadata || {},
    created: Math.floor(Date.now() / 1000),
  };

  customers.set(customer.id, customer);
  res.json(customer);
});

// Create subscription
app.post('/v1/subscriptions', (req: any, res: any) => {
  const { customer, items } = req.body;

  const subscription = {
    id: `sub_${Date.now()}_${Math.random().toString(36).substring(7)}`,
    object: 'subscription',
    customer,
    items: {
      data: items || [],
    },
    status: 'active',
    current_period_start: Math.floor(Date.now() / 1000),
    current_period_end: Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60,
    created: Math.floor(Date.now() / 1000),
  };

  subscriptions.set(subscription.id, subscription);
  res.json(subscription);
});

// Cancel subscription
app.delete('/v1/subscriptions/:id', (req: any, res: any) => {
  const { id } = req.params;
  const subscription = subscriptions.get(id);

  if (!subscription) {
    return res.status(404).json({ error: { message: 'Subscription not found' } });
  }

  subscription.status = 'canceled';
  subscription.canceled_at = Math.floor(Date.now() / 1000);
  subscriptions.set(id, subscription);

  res.json(subscription);
});

// Create refund
app.post('/v1/refunds', (req: any, res: any) => {
  const { payment_intent, amount } = req.body;

  const refund = {
    id: `re_${Date.now()}_${Math.random().toString(36).substring(7)}`,
    object: 'refund',
    amount,
    payment_intent,
    status: 'succeeded',
    created: Math.floor(Date.now() / 1000),
  };

  res.json(refund);
});

// Webhook endpoint
app.post('/webhook', (req: any, res: any) => {
  const event = req.body;
  console.log(`📨 Webhook event: ${event.type}`);
  res.json({ received: true });
});

// Health check
app.get('/health', (req: any, res: any) => {
  res.json({ 
    status: 'ok', 
    service: 'mock-payments', 
    port: config.port,
    mode: config.stripeMode,
  });
});

app.listen(config.port, () => {
  console.log(`💳 Mock Payments Service running on port ${config.port}`);
  console.log(`   Stripe Mode: ${config.stripeMode}`);
});