use crate::config::ActivationMode;
use std::time::{Duration, Instant};

#[derive(Debug, Clone)]
pub enum HotkeyEvent {
    RecordStart,
    RecordStop,
}

enum DetectorState {
    Idle,
    WaitingForDoubleTap { first_up: Instant },
    Recording,
}

pub struct HotkeyDetector {
    mode: ActivationMode,
    state: DetectorState,
    double_tap_threshold: Duration,
    key_is_down: bool,
}

impl HotkeyDetector {
    pub fn new(
        mode: ActivationMode,
        double_tap_ms: u64,
        _event_sender: std::sync::mpsc::Sender<HotkeyEvent>,
    ) -> Self {
        Self {
            mode,
            state: DetectorState::Idle,
            double_tap_threshold: Duration::from_millis(double_tap_ms),
            key_is_down: false,
        }
    }

    /// Update activation mode and double-tap threshold at runtime (hot-reload).
    pub fn update_mode(&mut self, mode: ActivationMode, double_tap_ms: u64) {
        self.mode = mode;
        self.double_tap_threshold = Duration::from_millis(double_tap_ms);
        self.state = DetectorState::Idle;
        self.key_is_down = false;
    }

    pub fn on_key_down(&mut self) -> Option<HotkeyEvent> {
        // Ignore key repeat
        if self.key_is_down {
            return None;
        }
        self.key_is_down = true;

        match self.mode {
            ActivationMode::Hold => {
                self.state = DetectorState::Recording;
                Some(HotkeyEvent::RecordStart)
            }
            ActivationMode::DoubleTap => match &self.state {
                DetectorState::Idle => {
                    // First tap down — wait for release then second tap
                    None
                }
                DetectorState::WaitingForDoubleTap { first_up } => {
                    if first_up.elapsed() < self.double_tap_threshold {
                        self.state = DetectorState::Recording;
                        Some(HotkeyEvent::RecordStart)
                    } else {
                        // Timeout — treat as new first tap
                        self.state = DetectorState::Idle;
                        None
                    }
                }
                DetectorState::Recording => {
                    self.state = DetectorState::Idle;
                    Some(HotkeyEvent::RecordStop)
                }
            },
        }
    }

    pub fn on_key_up(&mut self) -> Option<HotkeyEvent> {
        self.key_is_down = false;

        match self.mode {
            ActivationMode::Hold => {
                if matches!(self.state, DetectorState::Recording) {
                    self.state = DetectorState::Idle;
                    Some(HotkeyEvent::RecordStop)
                } else {
                    None
                }
            }
            ActivationMode::DoubleTap => {
                // After first tap release, start waiting for second tap
                if matches!(self.state, DetectorState::Idle) {
                    self.state = DetectorState::WaitingForDoubleTap {
                        first_up: Instant::now(),
                    };
                }
                None
            }
        }
    }
}
