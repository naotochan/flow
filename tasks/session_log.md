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

---

## 2026-07-24 07:04

### 完了したこと
- 次タスクの優先度を整理（実装なし）
  - アプリ別プロファイル → **見送り**（前面アプリ依存で予期せぬ整形になりやすい）
  - 音声コマンド → **後回し**
  - 音素材 → **待ち継続**で OK
  - 新規: **録音キャンセル**（Esc 等）・**履歴プライバシー** を P1 に追加

### 次のステップ
- **P1 #3 録音キャンセル** から着手（体感あり・サイズ小さめ）
- 続けて **P1 #4 履歴プライバシー**

### 気づき・メモ
- 誤操作を減らす系の方が、新機能よりコスパ良い判断
- バックログ: モード用ホットキー / カスタムモード / 直前ペースト取消 / 幻覚フィルタ / プロバイダ確認

---

## 2026-07-24 07:10

### 完了したこと
- **P1 #3 録音キャンセル** 実装（`feat/recording-cancel`）
  - Esc（listen-only CGEventTap）で録音破棄・STT/ペーストなし
  - クリップボード復元・オーバーレイ閉じ・Hold 解放後の誤 RecordStop 防止
  - オーバーレイ文言: 「聞き取り中… Escで取消」
- Flow **v1.2.0** (build **302**) を `/Applications` にインストール
- todo に OpenRouter 等の LLM 拡充を P1 #5 として追加

### 次のステップ
- 録音キャンセルの動作確認 → 問題なければ PR / main 取り込み
- 続けて **P1 #4 履歴プライバシー** → **P1 #5 LLM プロバイダ拡充（OpenRouter）**

### 気づき・メモ
- 処理中（STT/LLM）のキャンセルは未対応（録音フェーズのみ）
- `feat/feedback-sounds` は素材待ちのまま別ブランチ

---

## 2026-07-24 07:20

### 完了したこと
- 録音キャンセルを main にマージ（PR #6）
- **P1 #4 履歴プライバシー** 実装（`feat/history-privacy`）
  - `history_enabled`（オフで新規保存なし＋既存削除）
  - `history_retention_days`（0=しない / 1 / 7 / 30）
  - トレイ最近履歴も OFF 時は非表示
- Flow **v1.3.0** (build **303**)

### 次のステップ
- 履歴プライバシー確認 → PR / main
- **P1 #5 LLM プロバイダ拡充（OpenRouter）**

### 気づき・メモ
- 「機密モード」は履歴 OFF と同等として実装（別トグルは設けず）
