// tracing.js — Initialize OpenTelemetry BEFORE importing anything else
// Run with: node -r ./tracing.js app.js

'use strict';

const { NodeSDK } = require('@opentelemetry/sdk-node');
const { getNodeAutoInstrumentations } = require('@opentelemetry/auto-instrumentations-node');
const { OTLPTraceExporter } = require('@opentelemetry/exporter-trace-otlp-http');
const { OTLPMetricExporter } = require('@opentelemetry/exporter-metrics-otlp-http');
const { PeriodicExportingMetricReader } = require('@opentelemetry/sdk-metrics');
const { Resource } = require('@opentelemetry/resources');
const { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } = require('@opentelemetry/semantic-conventions');

// ── 1. Define your service identity ──────────────────────────────────────────
const resource = Resource.default().merge(
  new Resource({
    [ATTR_SERVICE_NAME]: 'otel-demo-api',
    [ATTR_SERVICE_VERSION]: '1.0.0',
    'deployment.environment': 'development',
  })
);

// ── 2. Configure TRACE exporter → Jaeger (via OTLP HTTP) ─────────────────────
//    Jaeger's OTLP HTTP endpoint listens on port 4318
const traceExporter = new OTLPTraceExporter({
  url: 'http://localhost:4318/v1/traces',
  headers: {},
});

// ── 3. Configure METRICS exporter → OTel Collector / Prometheus ──────────────
const metricExporter = new OTLPMetricExporter({
  url: 'http://localhost:4318/v1/metrics',
  headers: {},
});

// ── 4. Create the SDK ─────────────────────────────────────────────────────────
const sdk = new NodeSDK({
  resource,

  // Trace exporter
  traceExporter,

  // Metrics: export every 10 seconds
  metricReader: new PeriodicExportingMetricReader({
    exporter: metricExporter,
    exportIntervalMillis: 10_000,
  }),

  // Auto-instrumentation: traces Express, http, dns, pg, mongodb, redis, etc.
  instrumentations: [
    getNodeAutoInstrumentations({
      // Disable noisy fs instrumentation for clarity
      '@opentelemetry/instrumentation-fs': { enabled: false },
    }),
  ],
});

// ── 5. Start the SDK ──────────────────────────────────────────────────────────
sdk.start();
console.log('✅ OpenTelemetry initialized — traces → http://localhost:4318');

// ── 6. Graceful shutdown on exit ──────────────────────────────────────────────
process.on('SIGTERM', () => {
  sdk.shutdown()
    .then(() => console.log('OTel SDK shut down'))
    .catch(console.error)
    .finally(() => process.exit(0));
});
