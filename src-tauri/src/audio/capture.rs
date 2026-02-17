use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use cpal::{Device, SampleFormat, Stream, StreamConfig};
use std::sync::atomic::{AtomicBool, AtomicU32, Ordering};
use std::sync::{Arc, Mutex};

pub struct AudioRecorder {
    device: Device,
    config: StreamConfig,
    buffer: Arc<Mutex<Vec<f32>>>,
    is_recording: Arc<AtomicBool>,
    /// Current audio peak level (0.0–1.0), updated by the cpal callback.
    peak_level: Arc<AtomicU32>,
    stream: Option<Stream>,
    pub sample_rate: u32,
    pub channels: u16,
}

// Stream is not Send by default on some platforms, but we manage it safely
unsafe impl Send for AudioRecorder {}

impl AudioRecorder {
    pub fn new() -> Result<Self, Box<dyn std::error::Error + Send + Sync>> {
        let host = cpal::default_host();
        let device = host
            .default_input_device()
            .ok_or("No input device available")?;

        let supported_config = device.default_input_config()?;
        let sample_rate = supported_config.sample_rate().0;
        let channels = supported_config.channels();

        let config = StreamConfig {
            channels,
            sample_rate: cpal::SampleRate(sample_rate),
            buffer_size: cpal::BufferSize::Default,
        };

        log::info!(
            "Audio device: {}, rate: {}, channels: {}",
            device.name().unwrap_or_default(),
            sample_rate,
            channels
        );

        Ok(Self {
            device,
            config,
            buffer: Arc::new(Mutex::new(Vec::new())),
            is_recording: Arc::new(AtomicBool::new(false)),
            peak_level: Arc::new(AtomicU32::new(0)),
            stream: None,
            sample_rate,
            channels,
        })
    }

    pub fn start(&mut self) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
        // Clear previous buffer
        {
            let mut buf = self.buffer.lock().unwrap();
            buf.clear();
        }

        self.is_recording.store(true, Ordering::SeqCst);

        let buffer = Arc::clone(&self.buffer);
        let is_recording = Arc::clone(&self.is_recording);
        let peak_level = Arc::clone(&self.peak_level);
        let sample_format = self.device.default_input_config()?.sample_format();

        let stream = match sample_format {
            SampleFormat::F32 => self.device.build_input_stream(
                &self.config,
                move |data: &[f32], _: &cpal::InputCallbackInfo| {
                    if is_recording.load(Ordering::SeqCst) {
                        let peak = data.iter().map(|s| s.abs()).fold(0.0f32, f32::max);
                        // Store max peak since last read (compare-and-swap)
                        let mut prev_bits = peak_level.load(Ordering::Relaxed);
                        loop {
                            let prev = f32::from_bits(prev_bits);
                            if peak <= prev { break; }
                            match peak_level.compare_exchange_weak(
                                prev_bits, peak.to_bits(),
                                Ordering::Relaxed, Ordering::Relaxed,
                            ) {
                                Ok(_) => break,
                                Err(actual) => prev_bits = actual,
                            }
                        }
                        let mut buf = buffer.lock().unwrap();
                        buf.extend_from_slice(data);
                    }
                },
                |err| log::error!("Audio stream error: {}", err),
                None,
            )?,
            SampleFormat::I16 => {
                let buffer = Arc::clone(&self.buffer);
                let is_recording = Arc::clone(&self.is_recording);
                let peak_level = Arc::clone(&self.peak_level);
                self.device.build_input_stream(
                    &self.config,
                    move |data: &[i16], _: &cpal::InputCallbackInfo| {
                        if is_recording.load(Ordering::SeqCst) {
                            let peak = data.iter().map(|&s| (s as f32 / i16::MAX as f32).abs()).fold(0.0f32, f32::max);
                            let mut prev_bits = peak_level.load(Ordering::Relaxed);
                            loop {
                                let prev = f32::from_bits(prev_bits);
                                if peak <= prev { break; }
                                match peak_level.compare_exchange_weak(
                                    prev_bits, peak.to_bits(),
                                    Ordering::Relaxed, Ordering::Relaxed,
                                ) {
                                    Ok(_) => break,
                                    Err(actual) => prev_bits = actual,
                                }
                            }
                            let mut buf = buffer.lock().unwrap();
                            buf.extend(data.iter().map(|&s| s as f32 / i16::MAX as f32));
                        }
                    },
                    |err| log::error!("Audio stream error: {}", err),
                    None,
                )?
            }
            _ => return Err("Unsupported sample format".into()),
        };

        stream.play()?;
        self.stream = Some(stream);

        log::info!("Recording started");
        Ok(())
    }

    pub fn stop(&mut self) -> Vec<f32> {
        self.is_recording.store(false, Ordering::SeqCst);
        self.stream = None; // Drop the stream to stop recording

        let buf = self.buffer.lock().unwrap();
        let samples = buf.clone();
        log::info!("Recording stopped, {} samples captured", samples.len());
        samples
    }

    pub fn is_recording(&self) -> bool {
        self.is_recording.load(Ordering::SeqCst)
    }

    /// Take the peak audio level since last read (0.0–1.0), then reset to 0.
    pub fn take_peak_level(&self) -> f32 {
        f32::from_bits(self.peak_level.swap(0, Ordering::Relaxed)).clamp(0.0, 1.0)
    }

    /// Get clones of the atomic handles for lock-free polling from outside.
    pub fn atomic_handles(&self) -> (Arc<AtomicBool>, Arc<AtomicU32>) {
        (Arc::clone(&self.is_recording), Arc::clone(&self.peak_level))
    }
}
