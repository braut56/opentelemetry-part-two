// app.js — Express API with OpenTelemetry instrumentation
// Start with: node -r ./tracing.js app.js

'use strict';

const { trace, metrics, SpanStatusCode } = require('@opentelemetry/api');
const express = require('express');

const app = express();
app.use(express.json());

// ── Telemetry setup ───────────────────────────────────────────────────────────
const tracer = trace.getTracer('product-order-service', '1.0.0');
const meter  = metrics.getMeter('product-order-service', '1.0.0');

// Metrics instruments
const requestCounter = meter.createCounter('http.requests.total', {
  description: 'Total number of HTTP requests',
});
const errorCounter = meter.createCounter('http.errors.total', {
  description: 'Total number of HTTP errors',
});
const latencyHistogram = meter.createHistogram('http.request.duration.ms', {
  description: 'HTTP request duration in milliseconds',
  unit: 'ms',
});
const activeGauge = meter.createObservableGauge('http.active_requests', {
  description: 'Number of in-flight HTTP requests',
});
let activeRequests = 0;
activeGauge.addCallback(obs => obs.observe(activeRequests));

// ── Middleware: record metrics on every request ───────────────────────────────
app.use((req, res, next) => {
  const start = Date.now();
  activeRequests++;
  res.on('finish', () => {
    activeRequests--;
    const duration = Date.now() - start;
    const labels = { 'http.method': req.method, 'http.route': req.path, 'http.status_code': res.statusCode };
    requestCounter.add(1, labels);
    latencyHistogram.record(duration, labels);
    if (res.statusCode >= 500) errorCounter.add(1, labels);
  });
  next();
});

// ────────────────────────────────────────────────────────────────────────────
// ROUTE 1: GET /products
// Demonstrates: auto-traced HTTP + custom child span
// ────────────────────────────────────────────────────────────────────────────
app.get('/products', async (req, res) => {
  // The HTTP span is already created automatically by OTel auto-instrumentation.
  // Here we add a CHILD span for our database query logic.
  const span = tracer.startSpan('db.query.products');
  span.setAttribute('db.system', 'mock');
  span.setAttribute('db.operation', 'SELECT');
  span.setAttribute('db.table', 'products');

  try {
    // Simulate a database delay (50–100ms)
    await sleep(randomBetween(50, 100));

    const products = [
      { id: 1, name: 'Apple',  price: 1.20 },
      { id: 2, name: 'Banana', price: 0.50 },
      { id: 3, name: 'Cherry', price: 3.00 },
    ];

    span.setAttribute('db.rows_returned', products.length);
    span.setStatus({ code: SpanStatusCode.OK });
    res.json({ products });

  } catch (err) {
    span.recordException(err);
    span.setStatus({ code: SpanStatusCode.ERROR, message: err.message });
    res.status(500).json({ error: 'Failed to fetch products' });
  } finally {
    span.end(); // ← ALWAYS end your spans!
  }
});

// ────────────────────────────────────────────────────────────────────────────
// ROUTE 2: POST /orders
// Demonstrates: startActiveSpan (auto context propagation), events, error recording
// ────────────────────────────────────────────────────────────────────────────
app.post('/orders', async (req, res) => {
  const { productId, quantity, userId } = req.body;

  // startActiveSpan wraps a callback — child spans are automatically linked
  return tracer.startActiveSpan('order.process', async (orderSpan) => {
    orderSpan.setAttribute('order.product_id', productId ?? 'unknown');
    orderSpan.setAttribute('order.quantity', quantity ?? 0);
    orderSpan.setAttribute('user.id', userId ?? 'anonymous');

    try {
      // Step 1: Validate
      await tracer.startActiveSpan('order.validate', async (validateSpan) => {
        await sleep(20);
        if (!productId) throw new Error('productId is required');
        if (!quantity || quantity <= 0) throw new Error('quantity must be > 0');
        validateSpan.addEvent('order.validated', { 'validation.result': 'pass' });
        validateSpan.setStatus({ code: SpanStatusCode.OK });
        validateSpan.end();
      });

      // Step 2: Reserve inventory
      await tracer.startActiveSpan('inventory.reserve', async (invSpan) => {
        await sleep(randomBetween(30, 60));
        invSpan.setAttribute('inventory.product_id', productId);
        invSpan.setAttribute('inventory.reserved', quantity);
        invSpan.addEvent('inventory.reserved');
        invSpan.setStatus({ code: SpanStatusCode.OK });
        invSpan.end();
      });

      // Step 3: Charge payment
      await tracer.startActiveSpan('payment.charge', async (paySpan) => {
        await sleep(randomBetween(80, 150));
        const amount = quantity * 1.99;
        paySpan.setAttribute('payment.amount', amount);
        paySpan.setAttribute('payment.currency', 'USD');
        paySpan.addEvent('payment.charged', { 'payment.amount': amount });
        paySpan.setStatus({ code: SpanStatusCode.OK });
        paySpan.end();
      });

      const orderId = `ORD-${Date.now()}`;
      orderSpan.setAttribute('order.id', orderId);
      orderSpan.addEvent('order.created', { 'order.id': orderId });
      orderSpan.setStatus({ code: SpanStatusCode.OK });

      res.status(201).json({ orderId, status: 'confirmed' });

    } catch (err) {
      orderSpan.recordException(err);
      orderSpan.setStatus({ code: SpanStatusCode.ERROR, message: err.message });
      res.status(400).json({ error: err.message });

    } finally {
      orderSpan.end();
    }
  });
});

// ────────────────────────────────────────────────────────────────────────────
// ROUTE 3: GET /slow — Intentionally slow route to demo latency tracing
// ────────────────────────────────────────────────────────────────────────────
app.get('/slow', async (req, res) => {
  const delay = parseInt(req.query.ms) || 2000;
  await sleep(delay);
  res.json({ message: `Slept for ${delay}ms`, tip: 'Check Jaeger to see the latency!' });
});

// ── Health check ──────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => res.json({ status: 'ok', service: 'otel-demo-api' }));

// ── Start server ──────────────────────────────────────────────────────────────
app.listen(3000, () => {
  console.log('🚀 Server running on http://localhost:3000');
  console.log('📊 Jaeger UI     → http://localhost:16686');
  console.log('\nTry these endpoints:');
  console.log('  GET  http://localhost:3000/products');
  console.log('  POST http://localhost:3000/orders   (body: { "productId": 1, "quantity": 2, "userId": "u1" })');
  console.log('  GET  http://localhost:3000/slow?ms=500');
});

// ── Helpers ───────────────────────────────────────────────────────────────────
function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }
function randomBetween(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
