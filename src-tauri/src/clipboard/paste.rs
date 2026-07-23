use arboard::Clipboard;
use enigo::{Direction, Enigo, Key, Keyboard, Settings};
use std::thread;
use std::time::Duration;

pub fn copy_text(text: &str) -> Result<(), Box<dyn std::error::Error>> {
    let mut clipboard = Clipboard::new()?;
    clipboard.set_text(text)?;
    log::info!("Text copied to clipboard ({} chars)", text.len());
    Ok(())
}

pub fn get_clipboard_text() -> Result<String, Box<dyn std::error::Error>> {
    let mut clipboard = Clipboard::new()?;
    Ok(clipboard.get_text()?)
}

/// Best-effort restore of previous text clipboard contents.
/// `None` clears nothing (non-text previous content can't be restored via arboard).
pub fn restore_clipboard(previous: Option<&str>) -> Result<(), Box<dyn std::error::Error>> {
    let Some(text) = previous else {
        return Ok(());
    };
    copy_text(text)?;
    Ok(())
}

fn simulate_key(chord: char) -> Result<(), Box<dyn std::error::Error>> {
    // Split Press/Release with small delays — same pattern as paste (Cmd+V).
    let mut enigo = Enigo::new(&Settings::default())?;
    enigo.key(Key::Meta, Direction::Press)?;
    thread::sleep(Duration::from_millis(30));
    enigo.key(Key::Unicode(chord), Direction::Press)?;
    thread::sleep(Duration::from_millis(30));
    enigo.key(Key::Unicode(chord), Direction::Release)?;
    thread::sleep(Duration::from_millis(30));
    enigo.key(Key::Meta, Direction::Release)?;
    Ok(())
}

pub fn simulate_copy() -> Result<(), Box<dyn std::error::Error>> {
    simulate_key('c')?;
    log::info!("Copy simulated (Cmd+C)");
    Ok(())
}

pub fn copy_and_paste(text: &str) -> Result<(), Box<dyn std::error::Error>> {
    // 1. Copy to clipboard
    copy_text(text)?;

    // 2. Wait for clipboard to settle
    thread::sleep(Duration::from_millis(80));

    // 3. Simulate Cmd+V.
    //
    // We deliberately split the V keypress into explicit Press/Release with
    // small inter-event delays instead of a single `Click`. Without the
    // delays the target app can process 'v' before the Cmd modifier has
    // registered, producing a literal "v" or a no-op — a classic source of
    // intermittent paste failures on macOS.
    simulate_key('v')?;

    log::info!("Paste simulated (Cmd+V)");
    Ok(())
}

/// Simulate Cmd+Z to undo the last paste in the frontmost app.
pub fn simulate_undo() -> Result<(), Box<dyn std::error::Error>> {
    simulate_key('z')?;
    log::info!("Undo simulated (Cmd+Z)");
    Ok(())
}

/// Snapshot clipboard, Cmd+C the current selection, then read it back.
///
/// Returns `(previous_clipboard_text, selected_text)`.
/// `selected_text` is `None` when Cmd+C did not change the clipboard
/// (empty selection / non-copyable field).
pub fn capture_selection() -> Result<(Option<String>, Option<String>), Box<dyn std::error::Error>>
{
    let previous = get_clipboard_text().ok();

    simulate_copy()?;

    // Poll briefly — some apps are slow to update the pasteboard.
    let mut selected: Option<String> = None;
    for _ in 0..6 {
        thread::sleep(Duration::from_millis(50));
        match get_clipboard_text() {
            Ok(text) => {
                if previous.as_ref() != Some(&text) {
                    selected = Some(text);
                    break;
                }
            }
            Err(_) => break,
        }
    }

    if selected.is_some() {
        log::info!(
            "Selection captured ({} chars)",
            selected.as_ref().map(|s| s.len()).unwrap_or(0)
        );
    } else {
        log::info!("No selection change after Cmd+C — will insert at cursor");
    }

    Ok((previous, selected))
}
