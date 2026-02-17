[English](README.md) | **日本語**

# Whisper Dictation

Tauri で作った Mac 用の Speech-to-text デスクトップアプリです。OpenAI や LM Studio，faster-whisper-server からお好きな物をセットアップすることで，一般的な STT が使えます。

## Features

- **好きなホットキーを録音ボタンに** — 任意のボタン（あるいは組み合わせ）を録音ボタンに割り当て可能です
- **複数のSTTバックエンド** — OpenAI Whisper API / ローカル faster-whisper / LM Studio
- **LLM後処理（オプション）** — 一般的な AI サービス，あるいはローカルの LLM を使って後処理することが可能です
- **ローカル完結可能** — faster-whisper を使っているため，完全にローカルで駆動します

## 未確認事項

### 音声認識

- OpenAI / LM Studio の動作確認ができていません

### 後処理

- Claude / Ollama / OpenAI の動作確認ができていません

※つまり，faster-whisper-server と LM Studio による後処理の組み合わせしか確認できていません

## 必要環境

- macOS 12.0+
- [Node.js](https://nodejs.org/) 18+
- [Rust](https://www.rust-lang.org/tools/install) (stable)
- Python 3.9+（ローカルWhisperを使う場合のみ）

## インストール

### ビルド済みアプリ

[Releases](../../releases) ページからダウンロード（署名なし）。

### ソースからビルド

```bash
git clone https://github.com/YOUR_USERNAME/whisper-dictation.git
cd whisper-dictation
npm install
npx tauri build --bundles app
```

ビルド成果物: `src-tauri/target/release/bundle/macos/Whisper Dictation.app`

## セットアップ

1. アプリを起動するとオンボーディングが開始します
2. macOS権限を付与（アクセシビリティ / 入力監視 / マイク）。入力監視の権限を付与したあと，アプリの再起動が必要です
3. 音声認識エンジンを選択（OpenAI API / LM Studio / ローカルモデル (faster-whisper-server)）
4. ホットキーを設定
5. テスト録音で動作確認

### ローカルモデル（クラウド不要）

設定画面から「ローカルモデル」を選択し、ワンクリックセットアップを実行するだけ。Python venv の作成、faster-whisper のインストール、モデルのダウンロードまで自動で行います。

## 使い方

1. メニューバーのトレイアイコンから設定を開けます
2. ホットキーを押して話す → 離すと認識開始　※デフォルトでは押してる間だけ認識モードです
3. 認識結果が自動的にアクティブウィンドウにペーストされます

## 技術スタック

| レイヤー | 技術 |
|---------|------|
| フレームワーク | [Tauri v2](https://v2.tauri.app/) (Rust + WebView) |
| フロントエンド | React + TypeScript + Tailwind CSS |
| 音声録音 | [cpal](https://github.com/RustAudio/cpal) |
| STT | OpenAI Whisper API / [faster-whisper](https://github.com/SYSTRAN/faster-whisper) |
| LLM | Claude API / OpenAI API / Ollama / LM Studio |
| ペースト | [enigo](https://github.com/enigo-rs/enigo) (Cmd+V シミュレーション) |
| ホットキー | tauri-plugin-global-shortcut + macOS CGEventTap |

## ライセンス

MIT

## 謝辞

- [Tauri](https://tauri.app/) — Rustベースのデスクトップアプリフレームワーク
- [faster-whisper](https://github.com/SYSTRAN/faster-whisper) — CTranslate2ベースの高速Whisper実装
