##############666 Prerequisites

| Tool | Version | Install |
|------|---------|---------|
| Node.js | 18+ | https://nodejs.org |
| Docker Desktop | 20+ | https://docker.com |
| npm | 9+ | Ships with Node.js |

## Quick Start (5 steps)

### Step 1 — Clone / copy this folder

```bash
cd otel-demo
```

### Step 2 — Install Node.js dependencies

```bash
npm install
```

### Step 3 — Start the observability stack (Jaeger + Prometheus + Grafana)

```bash
docker compose up -d
```

Wait ~10 seconds for services to be healthy, then verify:
- **Jaeger UI** → http://localhost:16686
- **Prometheus** → http://localhost:9090
- **Grafana**    → http://localhost:3001 (no login needed)

### Step 4 — Start the Node.js app with OpenTelemetry

```bash
npm install
npm start
# or for auto-reload during development:
npm run dev
```

You should see:
```
✅ OpenTelemetry initialized — traces → http://localhost:4318
🚀 Server running on http://localhost:3000
```

### Step 5 — Generate some traffic

Open a new terminal and run:

```bash
# Get products (creates a trace with 2 spans)
curl http://localhost:3000/products

# Place an order (creates a trace with 5 spans)
curl -X POST http://localhost:3000/orders \
  -H "Content-Type: application/json" \
  -d '{"productId": 1, "quantity": 2, "userId": "user-123"}'

# Test a bad order (see error recording in action)
curl -X POST http://localhost:3000/orders \
  -H "Content-Type: application/json" \
  -d '{"quantity": 0}'

# Test a slow endpoint (see latency clearly in Jaeger)
curl "http://localhost:3000/slow?ms=800"
```

## Viewing Traces in Jaeger

1. Open http://localhost:16686
2. In the left sidebar, select **Service: `otel-demo-api`**
3. Click **"Find Traces"**
4. Click on any trace to see the full span waterfall
5. Expand spans to see attributes, events, and errors

### What you'll see per route

| Route | Spans | What to look for |
|-------|-------|-----------------|
| `GET /products` | 2 (HTTP + DB) | `db.rows_returned`, `db.operation` attributes |
| `POST /orders` | 5 nested spans | Validate → Reserve → Charge waterfall |
| `GET /slow?ms=X` | 1 | Clear latency visible in timeline |
| Bad `POST /orders` | Error span | Red error state + exception recorded |

## Project Structure

```
otel-demo/
├── tracing.js          # OTel SDK initialization (load first!)
├── app.js              # Express API with manual instrumentation
├── package.json        # Dependencies
├── docker-compose.yml  # Jaeger + Prometheus + Grafana
├── prometheus.yml      # Prometheus scrape config
└── grafana-datasources.yml  # Pre-configured datasources
```

## Key Concepts Demonstrated

| Concept | Where in code |
|---------|--------------|
| SDK initialization | `tracing.js` |
| Auto-instrumentation | `tracing.js` → `getNodeAutoInstrumentations()` |
| Resource attributes | `tracing.js` → `ATTR_SERVICE_NAME` |
| Custom child span | `app.js` → `GET /products` → `tracer.startSpan()` |
| Nested active spans | `app.js` → `POST /orders` → `startActiveSpan()` |
| Span attributes | `span.setAttribute('key', value)` |
| Span events | `span.addEvent('event.name', { attrs })` |
| Error recording | `span.recordException(err)` + `SpanStatusCode.ERROR` |
| Counters | `meter.createCounter()` |
| Histograms | `meter.createHistogram()` |
| Observable gauges | `meter.createObservableGauge()` |

## Stop Everything

```bash
# Stop Node.js app
Ctrl+C

# Stop Docker services
docker compose down
```
