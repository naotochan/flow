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
      grantPermissionsFirst: {
        ja: "すべての権限を許可してから次へ進んでください",
        en: "Grant all permissions before continuing",
      },
    },
    welcome: {
      title: { ja: "Flow へようこそ", en: "Welcome to Flow" },
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
    permissions: {
      title: { ja: "権限の設定", en: "Permissions" },
      description: {
        ja: "このアプリを使うには、以下の3つの権限が必要です。それぞれの設定を開いて、Flow を許可してください。",
        en: "This app requires the following three permissions. Please open each setting and grant access to Flow.",
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
      allGranted: {
        ja: "すべての権限が許可されています",
        en: "All permissions granted",
      },
    },
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
      pressAKey: { ja: "キーを押してください…", en: "Press a key…" },
    },
    test: {
      title: { ja: "テスト", en: "Test It Out" },
      description: {
        ja: "ホットキーを使って、下のテキストを読み上げてみましょう。ホットキーの変更を反映するにはアプリの再起動が必要です。",
        en: "Try reading the text below using your hotkey. The app needs to be restarted for hotkey changes to take effect.",
      },
      tryReading: { ja: "読み上げてみましょう", en: "Try reading aloud" },
      recording: { ja: "録音中…", en: "Recording…" },
      processing: { ja: "処理中…", en: "Processing…" },
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
      startingServer: {
        ja: "ローカルサーバーを起動しています…",
        en: "Starting local server…",
      },
      serverReady: {
        ja: "ローカルサーバー起動済み — 録音できます",
        en: "Local server ready — you can record",
      },
      serverStartFailed: {
        ja: "サーバーの起動に失敗しました。設定の「音声認識」から手動で開始してください。",
        en: "Failed to start the server. Start it manually from Transcription in Settings.",
      },
    },
  },

  // ─── Settings Panel ───
  settings: {
    appTitle: { ja: "Flow", en: "Flow" },
    saving: { ja: "保存中…", en: "Saving…" },
    setupGuide: { ja: "セットアップ画面を開く", en: "Open Setup" },
    loading: { ja: "読み込み中…", en: "Loading…" },
    nav: {
      general: { ja: "一般", en: "General" },
      transcription: { ja: "音声認識", en: "Transcription" },
      postProcessing: { ja: "後処理", en: "Post-Processing" },
      history: { ja: "履歴", en: "History" },
      dictionary: { ja: "辞書", en: "Dictionary" },
      test: { ja: "テスト", en: "Test" },
    },
    dictionary: {
      hint: {
        ja: "認識結果（LLM後処理のあと）に適用されます。長いフレーズから優先して置換します。",
        en: "Applied after recognition (and LLM, if on). Longer phrases win first.",
      },
      from: { ja: "認識された語", en: "Spoken / recognized" },
      to: { ja: "置換後", en: "Replace with" },
      fromPlaceholder: { ja: "例: なると", en: "e.g. naruto" },
      toPlaceholder: { ja: "例: ナルト", en: "e.g. Naruto" },
      add: { ja: "追加", en: "Add" },
      empty: {
        ja: "まだ辞書がありません。固有名詞や言い間違いの置換を追加できます。",
        en: "No entries yet. Add proper nouns or misheard phrases.",
      },
      enabled: { ja: "有効", en: "On" },
      delete: { ja: "削除", en: "Delete" },
      saveError: {
        ja: "「認識された語」を入力してください。",
        en: "Enter the phrase to replace.",
      },
    },
    history: {
      empty: {
        ja: "まだ認識履歴がありません。ホットキーで録音するとここに残ります。",
        en: "No recognition history yet. Dictations will appear here.",
      },
      copy: { ja: "コピー", en: "Copy" },
      paste: { ja: "ペースト", en: "Paste" },
      delete: { ja: "削除", en: "Delete" },
      clearAll: { ja: "すべて削除", en: "Clear All" },
      clearConfirm: {
        ja: "履歴をすべて削除しますか？",
        en: "Clear all history?",
      },
      copied: { ja: "コピーしました", en: "Copied" },
      rawLabel: { ja: "原文", en: "Raw" },
      pasteHint: {
        ja: "ペーストすると設定ウィンドウが閉じ、直前のアプリに貼り付けます。",
        en: "Paste hides Settings and pastes into the previously focused app.",
      },
    },
    general: {
      activationMode: { ja: "起動方式", en: "Activation Mode" },
      holdToRecord: { ja: "長押しで録音", en: "Hold to Record" },
      doubleTap: { ja: "ダブルタップ", en: "Double Tap" },
      hotkey: { ja: "ホットキー", en: "Hotkey" },
      pressAKey: { ja: "キーを押してください…", en: "Press a key…" },
      restartRequired: {
        ja: "ホットキー変更後はアプリの再起動が必要です。",
        en: "Restart required after changing the hotkey.",
      },
      restartNow: { ja: "今すぐ再起動", en: "Restart Now" },
      advanced: { ja: "詳細設定", en: "Advanced" },
      recognitionLanguage: { ja: "認識言語", en: "Recognition Language" },
      recognitionLanguageHint: {
        ja: "音声認識に使う言語です。表示言語とは別です。",
        en: "Language used for speech recognition. Separate from UI language.",
      },
      langAuto: { ja: "自動", en: "Auto" },
      langJapanese: { ja: "日本語", en: "Japanese" },
      langEnglish: { ja: "English", en: "English" },
      autoPaste: {
        ja: "カーソル位置に自動ペースト",
        en: "Auto-paste at cursor",
      },
      autoPasteHint: {
        ja: "認識結果をアクティブなアプリへすぐ挿入します。",
        en: "Insert results into the active app immediately.",
      },
      sounds: {
        ja: "操作音を再生",
        en: "Play feedback sounds",
      },
      soundsHint: {
        ja: "録音開始・完了・エラー時に短い音を出します。素材は後から差し替えできます。",
        en: "Short sounds on record start, success, and errors. Assets can be swapped in later.",
      },
      launchAtLogin: {
        ja: "ログイン時に自動起動",
        en: "Launch at login",
      },
      launchAtLoginHint: {
        ja: "Macにサインインしたときアプリを起動します。",
        en: "Start the app when you sign in to your Mac.",
      },
      appearance: { ja: "外観", en: "Appearance" },
      appearanceHint: {
        ja: "すぐに反映されます。",
        en: "Applies immediately.",
      },
      appearanceSystem: { ja: "システム", en: "System" },
      appearanceLight: { ja: "ライト", en: "Light" },
      appearanceDark: { ja: "ダーク", en: "Dark" },
      uiLanguage: { ja: "表示言語", en: "UI Language" },
      uiLanguageHint: {
        ja: "設定画面とオーバーレイの言語です。",
        en: "Language for Settings and the overlay.",
      },
      doubleTapInterval: { ja: "ダブルタップ間隔", en: "Double-tap interval" },
      doubleTapHint: {
        ja: "2回押しの間隔です。短いほど素早い操作が必要です。",
        en: "Time window between two presses. Shorter = faster taps required.",
      },
    },
    transcription: {
      provider: { ja: "プロバイダー", en: "Provider" },
      baseUrl: { ja: "ベースURL", en: "Base URL" },
      model: { ja: "モデル", en: "Model" },
      apiKey: { ja: "APIキー", en: "API Key" },
      localServer: { ja: "ローカルサーバー", en: "Local Server" },
      checking: { ja: "確認中…", en: "Checking…" },
      running: { ja: "実行中", en: "Running" },
      stopped: { ja: "停止中", en: "Stopped" },
      ready: { ja: "準備完了", en: "Ready" },
      needsSetup: { ja: "セットアップが必要", en: "Setup required" },
      downloadModel: { ja: "モデルをダウンロード", en: "Download Model" },
      modelDownloaded: { ja: "ダウンロード済み", en: "Model downloaded" },
      cancel: { ja: "キャンセル", en: "Cancel" },
      start: { ja: "開始", en: "Start" },
      starting: { ja: "起動中…", en: "Starting…" },
      stop: { ja: "停止", en: "Stop" },
      stopping: { ja: "停止中…", en: "Stopping…" },
      port: { ja: "ポート", en: "Port" },
      pythonPath: { ja: "Pythonパス", en: "Python Path" },
      pythonPathHint: {
        ja: "faster-whisperがインストールされたPythonのパス（例: /path/to/.venv/bin/python）",
        en: "Path to Python with faster-whisper installed (e.g. /path/to/.venv/bin/python)",
      },
      stopFailed: {
        ja: (err: string) => `停止に失敗しました: ${err}`,
        en: (err: string) => `Failed to stop: ${err}`,
      },
    },
    postProcessing: {
      mode: { ja: "モード", en: "Mode" },
      modeHint: {
        ja: "トレイメニューからも切り替えできます",
        en: "Also available from the tray menu",
      },
      modes: {
        raw: { ja: "そのまま", en: "Raw" },
        format: { ja: "整形", en: "Format" },
        email: { ja: "メール", en: "Email" },
        translate: { ja: "翻訳", en: "Translate" },
        code: { ja: "コード", en: "Code" },
      },
      modeDesc: {
        raw: {
          ja: "認識結果をそのまま使います（LLMなし）",
          en: "Use STT output as-is (no LLM)",
        },
        format: {
          ja: "句読点・改行コマンドを整えます",
          en: "Fix punctuation and spoken newline commands",
        },
        email: {
          ja: "丁寧なメール文面に整えます",
          en: "Shape dictation into a polished email body",
        },
        translate: {
          ja: "日英を相互翻訳します",
          en: "Translate between Japanese and English",
        },
        code: {
          ja: "コード・識別子向けに最小限の整形",
          en: "Light cleanup for code and identifiers",
        },
      },
      prompt: { ja: "システムプロンプト", en: "System prompt" },
      promptHint: {
        ja: "{language} は認識言語ヒントに置換されます",
        en: "{language} is replaced with the recognition language hint",
      },
      provider: { ja: "プロバイダー", en: "Provider" },
      baseUrl: { ja: "ベースURL", en: "Base URL" },
      model: { ja: "モデル", en: "Model" },
      apiKey: { ja: "APIキー", en: "API Key" },
      optionalForLocal: { ja: "（ローカルでは不要）", en: "(optional for local)" },
    },
    test: {
      tryReading: { ja: "読み上げてみましょう", en: "Try reading aloud" },
      recording: { ja: "録音中…", en: "Recording…" },
      processing: { ja: "処理中…", en: "Processing…" },
      pressToStart: {
        ja: (key: string, mode: string) =>
          `${key}（${mode}）で録音を開始`,
        en: (key: string, mode: string) =>
          `Press ${key} (${mode}) to start recording.`,
      },
    },
    updater: {
      checkForUpdates: { ja: "アップデートを確認…", en: "Check for Updates…" },
      checking: { ja: "確認中…", en: "Checking…" },
      upToDate: { ja: "最新版です", en: "Up to date" },
      availableVersion: {
        ja: (v: string) => `v${v} が利用可能`,
        en: (v: string) => `v${v} available`,
      },
      download: { ja: "ダウンロード", en: "Download" },
      downloading: { ja: "ダウンロード中…", en: "Downloading…" },
      readyToInstall: { ja: "インストール準備完了", en: "Ready to install" },
      relaunch: { ja: "再起動して更新", en: "Relaunch to Update" },
      error: { ja: "確認に失敗しました。ネットワークを確認して再試行してください。", en: "Check failed. Verify your network and try again." },
    },
  },

  // ─── Overlay / Status ───
  overlay: {
    listening: { ja: "聞き取り中…", en: "Listening…" },
    processing: { ja: "処理中…", en: "Processing…" },
    ready: { ja: "待機中", en: "Ready" },
    error: { ja: "エラー", en: "Error" },
    serverNotRunning: {
      ja: "サーバーが起動していません",
      en: "Server is not running",
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
