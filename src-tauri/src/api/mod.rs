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
///
/// The timeouts are a fix in their own right: with reqwest's default of "wait
/// forever", a hung STT server or API left the overlay stuck on "processing"
/// with no error path, since the awaiting call never returned. The total budget
/// is deliberately generous — transcribing a long recording with large-v3 on
/// CPU is genuinely slow — while the connect timeout fails fast on the common
/// case of nothing listening on the local STT port.
pub fn http_client() -> &'static reqwest::Client {
    HTTP_CLIENT.get_or_init(|| {
        reqwest::Client::builder()
            .connect_timeout(std::time::Duration::from_secs(10))
            .timeout(std::time::Duration::from_secs(300))
            .build()
            .expect("failed to build shared reqwest client")
    })
}
