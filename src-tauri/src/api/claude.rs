use crate::config::{LlmConfig, LlmProvider};
use serde_json::json;

pub async fn post_process(
    raw_text: &str,
    config: &LlmConfig,
    system_prompt: &str,
) -> Result<String, Box<dyn std::error::Error + Send + Sync>> {
    match config.provider {
        LlmProvider::Claude => call_claude(raw_text, config, system_prompt).await,
        LlmProvider::OpenaiCompatible => {
            call_openai_compatible(raw_text, config, system_prompt).await
        }
    }
}

/// Call Anthropic Claude API (Messages format)
async fn call_claude(
    raw_text: &str,
    config: &LlmConfig,
    system_prompt: &str,
) -> Result<String, Box<dyn std::error::Error + Send + Sync>> {
    let body = json!({
        "model": config.model,
        "max_tokens": 4096,
        "system": system_prompt,
        "messages": [
            { "role": "user", "content": raw_text }
        ]
    });

    let url = format!(
        "{}/v1/messages",
        config.base_url.trim_end_matches('/')
    );

    let client = crate::api::http_client();
    let response = client
        .post(&url)
        .header("x-api-key", &config.api_key)
        .header("anthropic-version", "2023-06-01")
        .header("content-type", "application/json")
        .json(&body)
        .send()
        .await?;

    if !response.status().is_success() {
        let status = response.status();
        let body = response.text().await.unwrap_or_default();
        return Err(format!("Claude API error {}: {}", status, body).into());
    }

    let json: serde_json::Value = response.json().await?;
    let text = json["content"][0]["text"]
        .as_str()
        .unwrap_or(raw_text)
        .to_string();

    Ok(text)
}

/// Call OpenAI-compatible API (works with LM Studio, Ollama, OpenAI, OpenRouter, etc.)
async fn call_openai_compatible(
    raw_text: &str,
    config: &LlmConfig,
    system_prompt: &str,
) -> Result<String, Box<dyn std::error::Error + Send + Sync>> {
    let body = json!({
        "model": config.model,
        "max_tokens": 4096,
        "messages": [
            { "role": "system", "content": system_prompt },
            { "role": "user", "content": raw_text }
        ]
    });

    let url = format!(
        "{}/chat/completions",
        config.base_url.trim_end_matches('/')
    );

    let client = crate::api::http_client();
    let mut request = client
        .post(&url)
        .header("content-type", "application/json")
        .json(&body);

    if !config.api_key.is_empty() {
        request = request.header("Authorization", format!("Bearer {}", config.api_key));
    }

    // OpenRouter ranking / attribution headers (optional but recommended).
    if config.base_url.contains("openrouter.ai") {
        request = request
            .header("HTTP-Referer", "https://github.com/naotochan/whisper-dictation")
            .header("X-Title", "Flow");
    }

    let response = request.send().await?;

    if !response.status().is_success() {
        let status = response.status();
        let body = response.text().await.unwrap_or_default();
        return Err(format!("LLM API error {} ({}): {}", status, url, body).into());
    }

    let json: serde_json::Value = response.json().await?;
    let text = json["choices"][0]["message"]["content"]
        .as_str()
        .unwrap_or(raw_text)
        .to_string();

    Ok(text)
}
