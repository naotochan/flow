# Session Log — Flow

## プロジェクト概要

macOS 向け音声テキスト変換デスクトップアプリ **Flow**（旧 Whisper Dictation）。
Tauri v2 + React + TypeScript。ホットキーで話して → STT → LLM 後処理モード → カーソルへペースト。
OpenAI Whisper API / faster-whisper / LM Studio に対応した STT と、
Claude / OpenAI / Ollama / LM Studio による LLM ポスト処理を備える。

**技術スタック**: Tauri v2 (Rust) / React + TypeScript + Tailwind CSS / cpal / enigo

---

<!-- 以降、Claude がタスク完了ごとに自動追記 -->

---

## 2026-07-23 19:56

### 完了したこと
- P0 完了後、P1「起動・完了音」の**配線のみ**実装（素材なし＝無音）
  - `src-tauri/src/sound.rs` + `sounds_enabled` 設定トグル
  - 録音開始 / 成功 / エラーで `afplay`（`start` / `done` / `error`）
  - 素材置き場: `src-tauri/sounds/` または App Support `com.flow.app/sounds/`
- ブランチ `feat/feedback-sounds` にコミット＆ push 済み（`f374948`）
- Flow **v1.1.0** (build **301**) を `/Applications` にインストール

### 次のステップ
- **音素材**: `start` / `done` / `error` を用意したら差し込み → その後 PR（いまは PR 出さない）
- **P1 #2 選択範囲置換**: `feat/replace-selection` で実装済み（設定トグル・Cmd+C→録音→Cmd+V→クリップボード復元）

### 気づき・メモ
- フィードバック音の PR は素材待ち。ブランチは残し、別タスクは `main` から新ブランチで進める
- Bundle ID `com.flow.desktop` / サポート dir `com.flow.app` 済み
- 選択範囲置換は opt-in（デフォルト OFF）。空選択時はカーソル挿入にフォールバック
