# Session Log — Flow

## プロジェクト概要

macOS 向け音声テキスト変換デスクトップアプリ **Flow**（旧 Whisper Dictation）。
Tauri v2 + React + TypeScript。ホットキーで話して → STT → LLM 後処理モード → カーソルへペースト。
OpenAI Whisper API / faster-whisper / LM Studio に対応した STT と、
Claude / OpenAI / Ollama / LM Studio による LLM ポスト処理を備える。

**技術スタック**: Tauri v2 (Rust) / React + TypeScript + Tailwind CSS / cpal / enigo

---

<!-- 以降、Claude がタスク完了ごとに自動追記 -->
