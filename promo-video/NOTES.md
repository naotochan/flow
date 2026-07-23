# Whisper Dictation — プロモ動画制作メモ (2026-02-18)

## やったこと

Remotion を使って Whisper Dictation の 15 秒プロモ動画を作成・書き出した。

---

## ファイル構成

```
promo-video/
├── package.json
├── tsconfig.json
├── remotion.config.ts
└── src/
    ├── index.ts
    ├── Root.tsx        # Composition定義 (1920x1080, 30fps, 450f)
    └── PromoVideo.tsx  # 全シーン実装
```

---

## 動画構成（15秒 / 30fps / 450フレーム）

### Scene 1 — タイトル（0〜90f / 0〜3s）
- アプリ名・ロゴ・バッジがスプリングアニメで登場
- パステルラベンダー背景 + 装飾ブロブ

### Scene 2 — ホットキー（90〜195f / 3〜6.5s）
- キーキャップ + 波紋エフェクト
- 「Any key you like」見出し

### Scene 3 — 録音中（195〜300f / 6.5〜10s）
- Aqua Voice 風ピル UI + リアルタイム波形アニメ
- Whisper API / Local Model / LM Studio チップ表示

### Scene 4 — ペースト（300〜390f / 10〜13s）
- モックアプリウィンドウにタイプライター風テキスト入力デモ

### Scene 5 — CTA（390〜450f / 13〜15s）
- グラデーション背景（violet → pink）
- 「Free. Open Source. Built for macOS.」
- GitHub URL バッジ

---

## 変更点

- キーキャップ内テキスト: `Right Shift` → `✦`（任意キーを示す汎用シンボル）
- 見出し: `One key to start recording` → `Any key you like`
- サブテキスト: `Assign any key or modifier — even Right Shift` → `Assign your favorite key or modifier to start recording`

---

## 出力ファイル

- パス: `promo-video/out/promo.mp4`
- サイズ: 1.6 MB
- 解像度: 1920 x 1080

---

## 主なコマンド

```bash
# プレビュー起動
cd promo-video && npm start

# MP4 書き出し
npx remotion render src/index.ts PromoVideo out/promo.mp4 --codec h264

# GIF 書き出し
npx remotion render src/index.ts PromoVideo out/promo.gif --codec gif
```
