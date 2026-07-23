fn main() {
    // Expose bundle.macOS.bundleVersion to the app as WD_BUILD_NUMBER.
    let conf_path = std::path::Path::new("tauri.conf.json");
    if let Ok(raw) = std::fs::read_to_string(conf_path) {
        if let Ok(v) = serde_json::from_str::<serde_json::Value>(&raw) {
            if let Some(build) = v
                .pointer("/bundle/macOS/bundleVersion")
                .and_then(|x| x.as_str())
            {
                println!("cargo:rustc-env=WD_BUILD_NUMBER={build}");
            }
        }
    }
    println!("cargo:rerun-if-changed=tauri.conf.json");
    tauri_build::build()
}
