use crate::config::SttConfig;
use reqwest::multipart;

pub async fn transcribe(
    audio_bytes: Vec<u8>,
    config: &SttConfig,
    language: Option<&str>,
) -> Result<String, Box<dyn std::error::Error + Send + Sync>> {
    let file_part = multipart::Part::bytes(audio_bytes)
        .file_name("audio.wav")
        .mime_str("audio/wav")?;

    let mut form = multipart::Form::new()
        .text("model", config.model.clone())
        .text("response_format", "json")
        .part("file", file_part);

    if let Some(lang) = language {
        form = form.text("language", lang.to_string());
    }

    // Prompt helps Whisper avoid hallucinating common phrases on silence/noise.
    // A neutral dictation-style prompt steers the model toward real transcription.
    //
    // Auto mode deliberately sends nothing: the prompt is also a language cue,
    // so an English one would bias detection against a Japanese speaker on the
    // short utterances where detection is already shakiest.
    let prompt = match language {
        Some("ja") => Some("音声入力による文章の書き取りです。"),
        Some("en") => Some("This is a voice dictation transcription."),
        _ => None,
    };
    if let Some(prompt) = prompt {
        form = form.text("prompt", prompt.to_string());
    }

    let url = format!(
        "{}/audio/transcriptions",
        config.base_url.trim_end_matches('/')
    );

    let client = crate::api::http_client();
    let mut request = client.post(&url).multipart(form);

    // Add auth header if API key is set (not needed for most local servers)
    if !config.api_key.is_empty() {
        request = request.header("Authorization", format!("Bearer {}", config.api_key));
    }

    let response = request.send().await?;

    if !response.status().is_success() {
        let status = response.status();
        let body = response.text().await.unwrap_or_default();
        return Err(format!("STT API error {} ({}): {}", status, url, body).into());
    }

    let json: serde_json::Value = response.json().await?;
    let text = json["text"].as_str().unwrap_or("").to_string();

    Ok(text)
}
