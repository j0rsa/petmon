use opentelemetry::trace::TracerProvider as _;
use opentelemetry_otlp::WithExportConfig;
use opentelemetry_sdk::{
    trace::{BatchSpanProcessor, SdkTracerProvider},
    Resource,
};
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt, EnvFilter};

/// Initialise the tracing stack.
///
/// When `otlp_endpoint` is `Some`, spans are exported via OTLP/HTTP to that
/// endpoint in addition to being emitted as JSON logs.  The returned
/// `SdkTracerProvider` must be shut down on process exit (call
/// [`shutdown`]).  When `otlp_endpoint` is `None` only JSON console logging
/// is configured.
pub fn init(
    service_name: &str,
    otlp_endpoint: Option<&str>,
    env_filter: EnvFilter,
) -> anyhow::Result<Option<SdkTracerProvider>> {
    let fmt_layer = tracing_subscriber::fmt::layer().json();

    if let Some(endpoint) = otlp_endpoint {
        let exporter = opentelemetry_otlp::SpanExporter::builder()
            .with_http()
            .with_endpoint(endpoint)
            .build()?;

        let resource = Resource::builder()
            .with_service_name(service_name.to_owned())
            .build();

        let batch = BatchSpanProcessor::builder(exporter).build();

        let provider = SdkTracerProvider::builder()
            .with_span_processor(batch)
            .with_resource(resource)
            .build();

        opentelemetry::global::set_tracer_provider(provider.clone());

        let tracer = provider.tracer(service_name.to_owned());

        tracing_subscriber::registry()
            .with(env_filter)
            .with(fmt_layer)
            .with(tracing_opentelemetry::layer().with_tracer(tracer))
            .init();

        Ok(Some(provider))
    } else {
        tracing_subscriber::registry()
            .with(env_filter)
            .with(fmt_layer)
            .init();

        Ok(None)
    }
}

/// Flush and shut down the tracer provider.  Call this before process exit to
/// ensure all in-flight spans are exported.
pub fn shutdown(provider: SdkTracerProvider) {
    if let Err(e) = provider.shutdown() {
        eprintln!("Failed to shut down tracer provider: {e}");
    }
}
