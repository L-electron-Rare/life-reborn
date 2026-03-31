import { NodeSDK } from "@opentelemetry/sdk-node";
import { getNodeAutoInstrumentations } from "@opentelemetry/auto-instrumentations-node";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-grpc";
import { resourceFromAttributes } from "@opentelemetry/resources";

const OTEL_ENDPOINT = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;

export function initTelemetry(): void {
  if (!OTEL_ENDPOINT) {
    console.log("OpenTelemetry disabled (OTEL_EXPORTER_OTLP_ENDPOINT not set)");
    return;
  }

  const sdk = new NodeSDK({
    resource: resourceFromAttributes({
      "service.name": process.env.OTEL_SERVICE_NAME || "life-reborn",
      "service.version": "1.0.0",
    }),
    traceExporter: new OTLPTraceExporter({
      url: OTEL_ENDPOINT,
    }),
    instrumentations: [getNodeAutoInstrumentations()],
  });

  sdk.start();
  console.log(`OpenTelemetry initialized, exporting to ${OTEL_ENDPOINT}`);

  process.on("SIGTERM", () => sdk.shutdown());
}
