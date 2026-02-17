export type UILanguage = "ja" | "en";

const translations = {
  // ─── Onboarding ───
  onboarding: {
    steps: {
      welcome: { ja: "はじめに", en: "Welcome" },
      permissions: { ja: "権限設定", en: "Permissions" },
      stt: { ja: "音声認識", en: "STT Setup" },
      hotkey: { ja: "ホットキー", en: "Hotkey" },
      test: { ja: "テスト", en: "Test" },
    },
    nav: {
      back: { ja: "戻る", en: "Back" },
      next: { ja: "次へ", en: "Next" },
      complete: { ja: "セットアップ完了", en: "Complete Setup" },
    },
    // Step: Welcome
    welcome: {
      title: { ja: "Whisper Dictation へようこそ", en: "Welcome to Whisper Dictation" },
      description: {
        ja: "ホットキーを押すだけで、音声をテキストに変換してアクティブなアプリにペーストする音声入力アプリです。",
        en: "A voice input app that converts speech to text and pastes it into the active app with just a hotkey press.",
      },
      features: [
        { ja: "ホットキーで即座に録音開始・停止", en: "Start/stop recording instantly with a hotkey" },
        { ja: "OpenAI Whisper またはローカルモデルで音声認識", en: "Speech recognition via OpenAI Whisper or local models" },
        { ja: "LLMによるテキスト後処理（整形・翻訳など）", en: "LLM post-processing (formatting, translation, etc.)" },
        { ja: "認識結果をアクティブなアプリに自動ペースト", en: "Auto-paste results into the active application" },
      ],
      getStarted: { ja: "セットアップを始めましょう", en: "Let's get started" },
    },
    // Step: Permissions
    permissions: {
      title: { ja: "権限の設定", en: "Permissions" },
      description: {
        ja: "このアプリを使うには、以下の3つの権限が必要です。それぞれの設定を開いて、Whisper Dictation を許可してください。",
        en: "This app requires the following three permissions. Please open each setting and grant access to Whisper Dictation.",
      },
      accessibility: {
        label: { ja: "アクセシビリティ", en: "Accessibility" },
        description: {
          ja: "テキストをアクティブなアプリにペーストするために必要です",
          en: "Required to paste text into the active application",
        },
      },
      inputMonitoring: {
        label: { ja: "入力監視", en: "Input Monitoring" },
        description: {
          ja: "ホットキー（キーボードショートカット）を検出するために必要です",
          en: "Required to detect hotkey (keyboard shortcut) presses",
        },
      },
      microphone: {
        label: { ja: "マイク", en: "Microphone" },
        description: {
          ja: "音声を録音するために必要です",
          en: "Required to record audio",
        },
      },
      openSettings: {
        ja: "システム設定を開く",
        en: "Open System Settings",
      },
      note: {
        ja: "設定を変更した場合、アプリの再起動が必要になることがあります。",
        en: "You may need to restart the app after changing these settings.",
      },
    },
    // Step: STT
    stt: {
      title: { ja: "音声認識エンジン", en: "Speech-to-Text" },
      description: {
        ja: "音声認識のプロバイダーを選択してください。",
        en: "Choose your STT provider.",
      },
      provider: { ja: "プロバイダー", en: "Provider" },
      model: { ja: "モデル", en: "Model" },
      baseUrl: { ja: "ベースURL", en: "Base URL" },
      apiKey: { ja: "APIキー", en: "API Key" },
      setupLocalWhisper: { ja: "ローカルモデルをセットアップ", en: "Setup Local Model" },
      localWhisperReady: { ja: "ローカルモデルの準備完了！", en: "Local model is ready!" },
      localWhisperNote: {
        ja: "お使いのマシンにWhisperモデルをインストールします（約140MB）。ネット不要で音声認識できます。",
        en: "Installs a Whisper model on your machine (~140MB). Enables offline speech recognition.",
      },
      retry: { ja: "再試行", en: "Retry" },
      tip: {
        ja: "音声認識のモデルは設定画面でより高精度なモデルに変更できます。",
        en: "You can switch to a larger model for better accuracy in Settings later.",
      },
    },
    // Step: Hotkey
    hotkey: {
      title: { ja: "ホットキー", en: "Hotkey" },
      description: {
        ja: "録音の開始・停止に使うキーを設定してください。",
        en: "Set the key to start and stop recording.",
      },
      activationMode: { ja: "起動方式", en: "Activation Mode" },
      holdToRecord: { ja: "長押しで録音", en: "Hold to Record" },
      doubleTap: { ja: "ダブルタップ", en: "Double Tap" },
      hotkeyLabel: { ja: "ホットキー", en: "Hotkey" },
      pressAKey: { ja: "キーを押してください...", en: "Press a key..." },
    },
    // Step: Test
    test: {
      title: { ja: "テスト", en: "Test It Out" },
      description: {
        ja: "ホットキーを使って、下のテキストを読み上げてみましょう。ホットキーの変更を反映するにはアプリの再起動が必要です。",
        en: "Try reading the text below using your hotkey. The app needs to be restarted for hotkey changes to take effect.",
      },
      tryReading: { ja: "読み上げてみましょう", en: "Try reading aloud" },
      recording: { ja: "録音中...", en: "Recording..." },
      processing: { ja: "処理中...", en: "Processing..." },
      pressToStart: {
        ja: (key: string, mode: string) =>
          `${key}（${mode === "hold" ? "長押し" : "ダブルタップ"}）で録音を開始`,
        en: (key: string, mode: string) =>
          `Press ${key} (${mode === "hold" ? "hold" : "double tap"}) to start recording.`,
      },
      tip: {
        ja: "音声認識のモデルは設定画面でより高精度なモデルに変更できます。また、LLM後処理を有効にすると、認識結果の修正・整形が可能です。\n※ 無音や小さな音声の場合、Whisperが「ご視聴ありがとうございました」等の定型文を誤出力することがあります。これはモデルの特性によるもので、より大きなモデルを使うことで改善されます。",
        en: "You can switch to a larger model for better accuracy in Settings later. You can also enable LLM post-processing to clean up and refine transcription results.\nNote: With silence or low audio, Whisper may output phrases like \"Thank you for watching.\" This is a known model behavior and improves with larger models.",
      },
    },
  },

  // ─── Settings Panel ───
  settings: {
    appTitle: { ja: "Whisper Dictation", en: "Whisper Dictation" },
    saving: { ja: "保存中...", en: "Saving..." },
    setupGuide: { ja: "セットアップ画面を開く", en: "Open Setup" },
    loading: { ja: "読み込み中...", en: "Loading..." },
    nav: {
      general: { ja: "一般", en: "General" },
      transcription: { ja: "音声認識", en: "Transcription" },
      postProcessing: { ja: "後処理", en: "Post-Processing" },
      test: { ja: "テスト", en: "Test" },
    },
    general: {
      activationMode: { ja: "起動方式", en: "Activation Mode" },
      holdToRecord: { ja: "長押しで録音", en: "Hold to Record" },
      doubleTap: { ja: "ダブルタップ", en: "Double Tap" },
      hotkey: { ja: "ホットキー", en: "Hotkey" },
      pressAKey: { ja: "キーを押してください...", en: "Press a key..." },
      restartRequired: {
        ja: "ホットキー変更後はアプリの再起動が必要です。",
        en: "Restart required after changing hotkey.",
      },
      advanced: { ja: "詳細設定", en: "Advanced" },
      language: { ja: "言語", en: "Language" },
      autoPaste: {
        ja: "カーソル位置に自動ペースト",
        en: "Auto-paste at cursor position",
      },
      uiLanguage: { ja: "表示言語", en: "UI Language" },
    },
    transcription: {
      provider: { ja: "プロバイダー", en: "Provider" },
      baseUrl: { ja: "ベースURL", en: "Base URL" },
      model: { ja: "モデル", en: "Model" },
      apiKey: { ja: "APIキー", en: "API Key" },
      localServer: { ja: "ローカルサーバー", en: "Local Server" },
      checking: { ja: "確認中...", en: "Checking..." },
      running: { ja: "実行中", en: "Running" },
      stopped: { ja: "停止中", en: "Stopped" },
      downloadModel: { ja: "モデルをダウンロード", en: "Download Model" },
      modelDownloaded: { ja: "ダウンロード済み", en: "Model downloaded" },
      cancel: { ja: "キャンセル", en: "Cancel" },
      start: { ja: "開始", en: "Start" },
      starting: { ja: "起動中...", en: "Starting..." },
      stop: { ja: "停止", en: "Stop" },
      stopping: { ja: "停止中...", en: "Stopping..." },
      port: { ja: "ポート", en: "Port" },
      pythonPath: { ja: "Pythonパス", en: "Python Path" },
      pythonPathHint: {
        ja: "faster-whisperがインストールされたPythonのパス（例: /path/to/.venv/bin/python）",
        en: "Path to Python with faster-whisper installed (e.g. /path/to/.venv/bin/python)",
      },
    },
    postProcessing: {
      enable: {
        ja: "LLM後処理を有効にする",
        en: "Enable LLM post-processing",
      },
      provider: { ja: "プロバイダー", en: "Provider" },
      baseUrl: { ja: "ベースURL", en: "Base URL" },
      model: { ja: "モデル", en: "Model" },
      apiKey: { ja: "APIキー", en: "API Key" },
      optionalForLocal: { ja: "（ローカルでは不要）", en: "(optional for local)" },
    },
    test: {
      tryReading: { ja: "読み上げてみましょう", en: "Try reading aloud" },
      recording: { ja: "録音中...", en: "Recording..." },
      processing: { ja: "処理中...", en: "Processing..." },
      pressToStart: {
        ja: (key: string, mode: string) =>
          `${key}（${mode}）で録音を開始`,
        en: (key: string, mode: string) =>
          `Press ${key} (${mode}) to start recording.`,
      },
    },
  },
} as const;

export function t(
  obj: { ja: string; en: string } | { ja: (...args: any[]) => string; en: (...args: any[]) => string },
  lang: UILanguage
): any {
  return obj[lang];
}

export { translations };
