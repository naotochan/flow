use arboard::Clipboard;
use enigo::{Direction, Enigo, Key, Keyboard, Settings};
use std::thread;
use std::time::Duration;

pub fn copy_and_paste(text: &str) -> Result<(), Box<dyn std::error::Error>> {
    // 1. Copy to clipboard
    let mut clipboard = Clipboard::new()?;
    clipboard.set_text(text)?;
    log::info!("Text copied to clipboard ({} chars)", text.len());

    // 2. Wait for clipboard to settle
    thread::sleep(Duration::from_millis(80));

    // 3. Simulate Cmd+V.
    //
    // We deliberately split the V keypress into explicit Press/Release with
    // small inter-event delays instead of a single `Click`. Without the
    // delays the target app can process 'v' before the Cmd modifier has
    // registered, producing a literal "v" or a no-op — a classic source of
    // intermittent paste failures on macOS.
    let mut enigo = Enigo::new(&Settings::default())?;
    enigo.key(Key::Meta, Direction::Press)?;
    thread::sleep(Duration::from_millis(30));
    enigo.key(Key::Unicode('v'), Direction::Press)?;
    thread::sleep(Duration::from_millis(30));
    enigo.key(Key::Unicode('v'), Direction::Release)?;
    thread::sleep(Duration::from_millis(30));
    enigo.key(Key::Meta, Direction::Release)?;

    log::info!("Paste simulated (Cmd+V)");
    Ok(())
}
