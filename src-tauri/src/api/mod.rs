pub mod whisper;
pub mod claude;

use std::sync::OnceLock;

static HTTP_CLIENT: OnceLock<reqwest::Client> = OnceLock::new();

/// Shared client for all outbound STT/LLM requests.
///
/// A fresh `reqwest::Client::new()` per call pays a new TCP (and, for HTTPS
/// endpoints like the OpenAI/Claude/OpenRouter cloud APIs, TLS) handshake on
/// every single dictation — reqwest's connection pooling only helps across
/// calls on the *same* client. Reusing one client keeps the pool warm and
/// shaves a network round trip or two off perceived recognition latency.
pub fn http_client() -> &'static reqwest::Client {
    HTTP_CLIENT.get_or_init(|| {
        reqwest::Client::builder()
            .build()
            .expect("failed to build shared reqwest client")
    })
}
