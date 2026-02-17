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
    thread::sleep(Duration::from_millis(50));

    // 3. Simulate Cmd+V
    let mut enigo = Enigo::new(&Settings::default())?;
    enigo.key(Key::Meta, Direction::Press)?;
    enigo.key(Key::Unicode('v'), Direction::Click)?;
    enigo.key(Key::Meta, Direction::Release)?;

    log::info!("Paste simulated (Cmd+V)");
    Ok(())
}
