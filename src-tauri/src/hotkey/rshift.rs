/// Modifier / special key listener using macOS CGEventTap.
///
/// Supports Right Shift, Left Shift, Left/Right Cmd, Left/Right Ctrl,
/// Left/Right Option, and Tab as standalone hotkeys — keys that
/// `tauri-plugin-global-shortcut` cannot register by themselves.
///
/// The CGEventTap is attached to the **main** CFRunLoop (required for
/// kCGHIDEventTap), but the callback does nothing more than a channel send
/// so it returns almost instantly and never triggers macOS's timeout-disable.
///
/// A separate dispatch thread drains the channel and invokes the caller's
/// closure, keeping heavy work off the event-tap callback entirely.
use std::ffi::c_void;
use std::sync::mpsc;

// macOS virtual keycodes
const KVK_RIGHT_SHIFT: i64 = 0x3C;
const KVK_LEFT_SHIFT: i64 = 0x38;
const KVK_LEFT_COMMAND: i64 = 0x37;
const KVK_RIGHT_COMMAND: i64 = 0x36;
const KVK_LEFT_CONTROL: i64 = 0x3B;
const KVK_RIGHT_CONTROL: i64 = 0x3E;
const KVK_LEFT_OPTION: i64 = 0x3A;
const KVK_RIGHT_OPTION: i64 = 0x3D;
const KVK_TAB: i64 = 0x30;

// CGEvent constants
const K_CG_EVENT_FLAGS_CHANGED: u32 = 12;
const K_CG_EVENT_KEY_DOWN: u32 = 10;
const K_CG_EVENT_KEY_UP: u32 = 11;
const K_CG_EVENT_TAP_DISABLED_BY_TIMEOUT: u32 = 0xFFFFFFFE;
const K_CG_EVENT_TAP_OPTION_LISTEN_ONLY: u32 = 1;
const K_CG_HID_EVENT_TAP: u32 = 0;
const K_CG_HEAD_INSERT_EVENT_TAP: u32 = 0;
const K_CG_KEYBOARD_EVENT_KEYCODE: u32 = 9;

// Flag masks for modifier detection
const K_CG_EVENT_FLAG_MASK_SHIFT: u64 = 0x0002_0000;
const K_CG_EVENT_FLAG_MASK_CONTROL: u64 = 0x0004_0000;
const K_CG_EVENT_FLAG_MASK_ALTERNATE: u64 = 0x0008_0000;
const K_CG_EVENT_FLAG_MASK_COMMAND: u64 = 0x0010_0000;

type CGEventRef = *mut c_void;
type CGEventTapProxy = *mut c_void;
type CFMachPortRef = *mut c_void;

extern "C" {
    fn CGEventTapCreate(
        tap: u32,
        place: u32,
        options: u32,
        events_of_interest: u64,
        callback: extern "C" fn(CGEventTapProxy, u32, CGEventRef, *mut c_void) -> CGEventRef,
        user_info: *mut c_void,
    ) -> CFMachPortRef;

    fn CGEventGetIntegerValueField(event: CGEventRef, field: u32) -> i64;
    fn CGEventGetFlags(event: CGEventRef) -> u64;
    fn CGEventTapEnable(tap: CFMachPortRef, enable: bool);

    fn CFMachPortCreateRunLoopSource(
        allocator: *mut c_void,
        port: CFMachPortRef,
        order: i64,
    ) -> *mut c_void;

    fn CFRunLoopGetMain() -> *mut c_void;
    fn CFRunLoopAddSource(rl: *mut c_void, source: *mut c_void, mode: *mut c_void);
    fn CFRunLoopRemoveSource(rl: *mut c_void, source: *mut c_void, mode: *mut c_void);
    fn CFMachPortInvalidate(port: CFMachPortRef);

    static kCFRunLoopCommonModes: *mut c_void;
    static kCFAllocatorDefault: *mut c_void;
}

/// Which key the CGEventTap should watch for.
#[derive(Debug, Clone, Copy)]
enum TargetKey {
    /// A modifier key detected via kCGEventFlagsChanged
    Modifier { keycode: i64, flag_mask: u64 },
    /// A normal key detected via keyDown/keyUp
    Normal { keycode: i64 },
}

/// Global tap reference for re-enabling after timeout.
static mut EVENT_TAP: CFMachPortRef = std::ptr::null_mut();
/// Run loop source — needed for cleanup.
static mut EVENT_TAP_SOURCE: *mut c_void = std::ptr::null_mut();
/// Channel sender — the callback only does `send()`, nothing else.
static mut SENDER: Option<mpsc::Sender<bool>> = None;
/// Which key we're listening for.
static mut TARGET_KEY: Option<TargetKey> = None;

extern "C" fn event_tap_callback(
    _proxy: CGEventTapProxy,
    event_type: u32,
    event: CGEventRef,
    _user_info: *mut c_void,
) -> CGEventRef {
    // macOS disables the tap after a timeout — re-enable it immediately
    if event_type == K_CG_EVENT_TAP_DISABLED_BY_TIMEOUT {
        log::warn!("CGEventTap disabled by timeout, re-enabling...");
        unsafe {
            if !EVENT_TAP.is_null() {
                CGEventTapEnable(EVENT_TAP, true);
            }
        }
        return event;
    }

    unsafe {
        let target = match TARGET_KEY {
            Some(t) => t,
            None => return event,
        };

        match target {
            TargetKey::Modifier { keycode, flag_mask } => {
                if event_type == K_CG_EVENT_FLAGS_CHANGED {
                    let kc = CGEventGetIntegerValueField(event, K_CG_KEYBOARD_EVENT_KEYCODE);
                    if kc == keycode {
                        let flags = CGEventGetFlags(event);
                        let pressed = (flags & flag_mask) != 0;
                        if let Some(ref tx) = SENDER {
                            let _ = tx.send(pressed);
                        }
                    }
                }
            }
            TargetKey::Normal { keycode } => {
                if event_type == K_CG_EVENT_KEY_DOWN || event_type == K_CG_EVENT_KEY_UP {
                    let kc = CGEventGetIntegerValueField(event, K_CG_KEYBOARD_EVENT_KEYCODE);
                    if kc == keycode {
                        let pressed = event_type == K_CG_EVENT_KEY_DOWN;
                        if let Some(ref tx) = SENDER {
                            let _ = tx.send(pressed);
                        }
                    }
                }
            }
        }
    }

    event
}

/// Returns true if the given hotkey string should use CGEventTap instead of global-shortcut.
pub fn is_eventtap_key(key: &str) -> bool {
    matches!(
        key,
        "right_shift"
            | "left_shift"
            | "left_cmd"
            | "right_cmd"
            | "left_ctrl"
            | "right_ctrl"
            | "left_option"
            | "right_option"
            | "tab"
    )
}

/// Install a CGEventTap on the **main** run loop that listens for the given key.
/// `callback(true)` = pressed, `callback(false)` = released.
/// The callback is invoked on a dedicated dispatch thread, NOT in the
/// CGEventTap callback itself.
/// Must be called during app setup (main thread).
pub fn install_key_listener(hotkey: &str, mut callback: impl FnMut(bool) + Send + 'static) {
    let (target, event_mask) = match hotkey {
        "right_shift" => (
            TargetKey::Modifier { keycode: KVK_RIGHT_SHIFT, flag_mask: K_CG_EVENT_FLAG_MASK_SHIFT },
            1u64 << K_CG_EVENT_FLAGS_CHANGED,
        ),
        "left_shift" => (
            TargetKey::Modifier { keycode: KVK_LEFT_SHIFT, flag_mask: K_CG_EVENT_FLAG_MASK_SHIFT },
            1u64 << K_CG_EVENT_FLAGS_CHANGED,
        ),
        "left_cmd" => (
            TargetKey::Modifier { keycode: KVK_LEFT_COMMAND, flag_mask: K_CG_EVENT_FLAG_MASK_COMMAND },
            1u64 << K_CG_EVENT_FLAGS_CHANGED,
        ),
        "right_cmd" => (
            TargetKey::Modifier { keycode: KVK_RIGHT_COMMAND, flag_mask: K_CG_EVENT_FLAG_MASK_COMMAND },
            1u64 << K_CG_EVENT_FLAGS_CHANGED,
        ),
        "left_ctrl" => (
            TargetKey::Modifier { keycode: KVK_LEFT_CONTROL, flag_mask: K_CG_EVENT_FLAG_MASK_CONTROL },
            1u64 << K_CG_EVENT_FLAGS_CHANGED,
        ),
        "right_ctrl" => (
            TargetKey::Modifier { keycode: KVK_RIGHT_CONTROL, flag_mask: K_CG_EVENT_FLAG_MASK_CONTROL },
            1u64 << K_CG_EVENT_FLAGS_CHANGED,
        ),
        "left_option" => (
            TargetKey::Modifier { keycode: KVK_LEFT_OPTION, flag_mask: K_CG_EVENT_FLAG_MASK_ALTERNATE },
            1u64 << K_CG_EVENT_FLAGS_CHANGED,
        ),
        "right_option" => (
            TargetKey::Modifier { keycode: KVK_RIGHT_OPTION, flag_mask: K_CG_EVENT_FLAG_MASK_ALTERNATE },
            1u64 << K_CG_EVENT_FLAGS_CHANGED,
        ),
        "tab" => (
            TargetKey::Normal { keycode: KVK_TAB },
            (1u64 << K_CG_EVENT_KEY_DOWN) | (1u64 << K_CG_EVENT_KEY_UP),
        ),
        _ => {
            log::error!("install_key_listener called with unsupported key: {}", hotkey);
            return;
        }
    };

    let (tx, rx) = mpsc::channel::<bool>();

    unsafe {
        SENDER = Some(tx);
        TARGET_KEY = Some(target);
    }

    // Dispatch thread: drains channel and invokes the caller's closure
    let key_name = hotkey.to_string();
    std::thread::Builder::new()
        .name(format!("{}-dispatch", hotkey))
        .spawn(move || {
            while let Ok(pressed) = rx.recv() {
                callback(pressed);
            }
        })
        .expect("Failed to spawn key dispatch thread");

    unsafe {
        let tap = CGEventTapCreate(
            K_CG_HID_EVENT_TAP,
            K_CG_HEAD_INSERT_EVENT_TAP,
            K_CG_EVENT_TAP_OPTION_LISTEN_ONLY,
            event_mask,
            event_tap_callback,
            std::ptr::null_mut(),
        );

        if tap.is_null() {
            log::error!(
                "Failed to create CGEventTap for '{}'. \
                 Grant Accessibility permission in System Settings > \
                 Privacy & Security > Accessibility.",
                key_name
            );
            return;
        }

        EVENT_TAP = tap;

        let source = CFMachPortCreateRunLoopSource(kCFAllocatorDefault, tap, 0);
        if source.is_null() {
            log::error!("Failed to create run loop source for CGEventTap");
            return;
        }

        EVENT_TAP_SOURCE = source;

        let main_loop = CFRunLoopGetMain();
        CFRunLoopAddSource(main_loop, source, kCFRunLoopCommonModes);

        log::info!("CGEventTap installed for '{}' on main run loop", key_name);
    }
}

/// Remove the current CGEventTap from the run loop and clean up.
/// Safe to call even if no tap is installed.
pub fn uninstall_key_listener() {
    unsafe {
        if !EVENT_TAP.is_null() {
            // Disable the tap first
            CGEventTapEnable(EVENT_TAP, false);

            // Remove source from run loop
            if !EVENT_TAP_SOURCE.is_null() {
                let main_loop = CFRunLoopGetMain();
                CFRunLoopRemoveSource(main_loop, EVENT_TAP_SOURCE, kCFRunLoopCommonModes);
                EVENT_TAP_SOURCE = std::ptr::null_mut();
            }

            // Invalidate the mach port
            CFMachPortInvalidate(EVENT_TAP);
            EVENT_TAP = std::ptr::null_mut();

            log::info!("CGEventTap uninstalled");
        }

        // Drop sender to terminate the dispatch thread
        TARGET_KEY = None;
        SENDER = None;
    }
}

// --- Escape cancel listener (separate tap; can coexist with the hotkey tap) ---

const KVK_ESCAPE: i64 = 0x35;

static mut CANCEL_TAP: CFMachPortRef = std::ptr::null_mut();
static mut CANCEL_TAP_SOURCE: *mut c_void = std::ptr::null_mut();
static mut CANCEL_SENDER: Option<mpsc::Sender<()>> = None;

extern "C" fn cancel_tap_callback(
    _proxy: CGEventTapProxy,
    event_type: u32,
    event: CGEventRef,
    _user_info: *mut c_void,
) -> CGEventRef {
    if event_type == K_CG_EVENT_TAP_DISABLED_BY_TIMEOUT {
        log::warn!("Cancel CGEventTap disabled by timeout, re-enabling...");
        unsafe {
            if !CANCEL_TAP.is_null() {
                CGEventTapEnable(CANCEL_TAP, true);
            }
        }
        return event;
    }

    if event_type == K_CG_EVENT_KEY_DOWN {
        unsafe {
            let kc = CGEventGetIntegerValueField(event, K_CG_KEYBOARD_EVENT_KEYCODE);
            if kc == KVK_ESCAPE {
                if let Some(ref tx) = CANCEL_SENDER {
                    let _ = tx.send(());
                }
            }
        }
    }

    event
}

/// Install a listen-only Escape tap. Invokes `on_escape` on key-down (dispatch thread).
/// Safe to call when already installed (no-op).
pub fn install_cancel_listener(mut on_escape: impl FnMut() + Send + 'static) {
    unsafe {
        if !CANCEL_TAP.is_null() {
            return;
        }
    }

    let (tx, rx) = mpsc::channel::<()>();
    unsafe {
        CANCEL_SENDER = Some(tx);
    }

    std::thread::Builder::new()
        .name("escape-cancel-dispatch".into())
        .spawn(move || {
            while let Ok(()) = rx.recv() {
                on_escape();
            }
        })
        .expect("Failed to spawn escape cancel dispatch thread");

    let event_mask = 1u64 << K_CG_EVENT_KEY_DOWN;
    unsafe {
        let tap = CGEventTapCreate(
            K_CG_HID_EVENT_TAP,
            K_CG_HEAD_INSERT_EVENT_TAP,
            K_CG_EVENT_TAP_OPTION_LISTEN_ONLY,
            event_mask,
            cancel_tap_callback,
            std::ptr::null_mut(),
        );

        if tap.is_null() {
            log::error!(
                "Failed to create Escape CGEventTap. \
                 Grant Accessibility permission in System Settings."
            );
            CANCEL_SENDER = None;
            return;
        }

        CANCEL_TAP = tap;
        let source = CFMachPortCreateRunLoopSource(kCFAllocatorDefault, tap, 0);
        if source.is_null() {
            log::error!("Failed to create run loop source for Escape CGEventTap");
            CFMachPortInvalidate(tap);
            CANCEL_TAP = std::ptr::null_mut();
            CANCEL_SENDER = None;
            return;
        }

        CANCEL_TAP_SOURCE = source;
        let main_loop = CFRunLoopGetMain();
        CFRunLoopAddSource(main_loop, source, kCFRunLoopCommonModes);
        log::info!("Escape cancel CGEventTap installed");
    }
}

/// Remove the Escape cancel tap. Safe if none installed.
pub fn uninstall_cancel_listener() {
    unsafe {
        if !CANCEL_TAP.is_null() {
            CGEventTapEnable(CANCEL_TAP, false);
            if !CANCEL_TAP_SOURCE.is_null() {
                let main_loop = CFRunLoopGetMain();
                CFRunLoopRemoveSource(main_loop, CANCEL_TAP_SOURCE, kCFRunLoopCommonModes);
                CANCEL_TAP_SOURCE = std::ptr::null_mut();
            }
            CFMachPortInvalidate(CANCEL_TAP);
            CANCEL_TAP = std::ptr::null_mut();
            log::info!("Escape cancel CGEventTap uninstalled");
        }
        CANCEL_SENDER = None;
    }
}

