fn main() {
    // Without this, cargo does not know the embedded assets changed when the
    // frontend rebuilds, and the exe keeps serving a stale bundle.
    println!("cargo:rerun-if-changed=../dist");
    tauri_build::build()
}
