fn main() {
    // Ensure the dist folder exists before build
    let dist_path = std::path::PathBuf::from("../dist");
    if !dist_path.exists() {
        panic!("Frontend dist folder not found at {:?}. Run 'pnpm build:tauri' first.", dist_path);
    }
    
    println!("cargo:rerun-if-changed=../dist");
    tauri_build::build()
}
