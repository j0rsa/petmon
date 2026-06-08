use std::{env, fs, path::PathBuf};

fn main() {
    println!("cargo:rerun-if-changed=frontend");

    let manifest_dir = PathBuf::from(env::var("CARGO_MANIFEST_DIR").expect("manifest dir"));
    let dist_dir = manifest_dir.join("frontend/dist");
    if let Err(err) = fs::create_dir_all(&dist_dir) {
        panic!("failed to create frontend/dist: {err}");
    }

    let index_path = dist_dir.join("index.html");
    if !index_path.exists() {
        fs::write(
            &index_path,
            r#"<!doctype html><html><head><meta charset="utf-8"><title>catmon</title></head><body><div id="root">Frontend not built yet.</div></body></html>"#,
        )
        .expect("failed to write placeholder index.html");
    }
}
