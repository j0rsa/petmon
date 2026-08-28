use std::{env, fs, path::PathBuf, process::Command};

fn main() {
    println!("cargo:rerun-if-changed=frontend");
    println!("cargo:rerun-if-changed=.git/HEAD");
    println!("cargo:rerun-if-changed=.git/refs");

    // ── Frontend dist placeholder ─────────────────────────────────────────────
    let manifest_dir = PathBuf::from(env::var("CARGO_MANIFEST_DIR").expect("manifest dir"));
    let dist_dir = manifest_dir.join("frontend/dist");
    if let Err(err) = fs::create_dir_all(&dist_dir) {
        panic!("failed to create frontend/dist: {err}");
    }
    let index_path = dist_dir.join("index.html");
    if !index_path.exists() {
        fs::write(
            &index_path,
            r#"<!doctype html><html><head><meta charset="utf-8"><title>petmon</title></head><body><div id="root">Frontend not built yet.</div></body></html>"#,
        )
        .expect("failed to write placeholder index.html");
    }

    // ── Version info ──────────────────────────────────────────────────────────
    let version = env::var("CARGO_PKG_VERSION").unwrap_or_else(|_| "unknown".to_string());

    println!("cargo:rerun-if-env-changed=PETMON_GIT_SHA");

    let git_sha = env::var("PETMON_GIT_SHA")
        .ok()
        .map(|s| s.trim().chars().take(7).collect::<String>())
        .filter(|s| !s.is_empty())
        .or_else(|| {
            Command::new("git")
                .args(["rev-parse", "--short", "HEAD"])
                .output()
                .ok()
                .and_then(|o| {
                    if o.status.success() {
                        Some(o.stdout)
                    } else {
                        None
                    }
                })
                .map(|b| String::from_utf8_lossy(&b).trim().to_string())
        })
        .unwrap_or_else(|| "unknown".to_string());

    let out_dir = PathBuf::from(env::var("OUT_DIR").expect("OUT_DIR"));
    fs::write(
        out_dir.join("version_info.rs"),
        format!(
            r#"pub const VERSION: &str = "{version}";
pub const GIT_SHA: &str = "{git_sha}";
"#
        ),
    )
    .expect("failed to write version_info.rs");
}
