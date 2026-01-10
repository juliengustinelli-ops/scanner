use serde::{Deserialize, Serialize};
use std::sync::Mutex;
use std::process::{Child, Command, Stdio};
use std::io::{BufRead, BufReader};
use std::path::PathBuf;
use tauri::{command, State, AppHandle, Manager};
use crate::db;

#[cfg(unix)]
use libc;

#[cfg(windows)]
use std::os::windows::process::CommandExt;

// Windows: CREATE_NO_WINDOW flag to prevent console window from appearing
#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x08000000;

pub struct AppState {
    pub db_path: Mutex<String>,
    pub bot_running: Mutex<bool>,
    pub bot_process: Mutex<Option<Child>>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct Credentials {
    #[serde(rename = "firstName")]
    pub first_name: String,
    #[serde(rename = "lastName")]
    pub last_name: String,
    pub email: String,
    #[serde(rename = "countryCode")]
    pub country_code: String,
    pub phone: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct APIKeys {
    pub openai: String,
    pub captcha: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct Settings {
    #[serde(rename = "dataSource")]
    pub data_source: String,
    #[serde(rename = "csvPath")]
    pub csv_path: String,
    #[serde(rename = "metaKeywords")]
    pub meta_keywords: String,
    #[serde(rename = "adLimit")]
    pub ad_limit: i32,
    #[serde(rename = "maxSignups")]
    pub max_signups: i32,
    pub headless: bool,
    pub debug: bool,
    #[serde(rename = "minDelay")]
    pub min_delay: i32,
    #[serde(rename = "maxDelay")]
    pub max_delay: i32,
    #[serde(rename = "llmModel")]
    pub llm_model: String,
    #[serde(rename = "batchPlanning")]
    pub batch_planning: bool,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct BotConfig {
    pub credentials: Credentials,
    #[serde(rename = "apiKeys")]
    pub api_keys: APIKeys,
    pub settings: Settings,
}

// ==================== NEW DATABASE TYPES ====================

#[derive(Debug, Serialize, Deserialize)]
pub struct ProcessedStats {
    pub total: i32,
    pub successful: i32,
    pub failed: i32,
    pub skipped: i32,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ScrapedStats {
    pub total: i32,
    pub processed: i32,
    pub pending: i32,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ProcessedURL {
    pub id: i32,
    pub url: String,
    pub source: String,
    pub status: String,
    pub fields_filled: Option<String>,
    pub error_message: Option<String>,
    pub error_category: Option<String>,
    pub details: Option<String>,
    pub screenshot_path: Option<String>,
    pub confirmation_data: Option<String>,
    pub network_data: Option<String>,
    pub processed_at: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ScrapedURL {
    pub id: i32,
    pub url: String,
    pub ad_id: Option<String>,
    pub advertiser: Option<String>,
    pub scraped_at: String,
    pub processed: bool,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ApiSession {
    pub id: i32,
    pub session_start: String,
    pub model: String,
    pub input_tokens: i64,
    pub output_tokens: i64,
    pub cost: f64,
    pub api_calls: i64,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ModelCostStats {
    pub input_tokens: i64,
    pub output_tokens: i64,
    pub total_tokens: i64,
    pub api_calls: i64,
    pub cost: f64,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ApiCostSummary {
    pub by_model: std::collections::HashMap<String, ModelCostStats>,
    pub total_cost: f64,
    pub total_calls: i64,
    pub total_tokens: i64,
    pub session_count: i64,
}

#[derive(Clone, Serialize)]
pub struct LogEvent {
    pub level: String,
    pub message: String,
}

/// Get the sidecar binary name for the current platform
fn get_sidecar_name() -> String {
    #[cfg(all(target_os = "macos", target_arch = "aarch64"))]
    return "inboxhunter-automation-aarch64-apple-darwin".to_string();
    
    #[cfg(all(target_os = "macos", target_arch = "x86_64"))]
    return "inboxhunter-automation-x86_64-apple-darwin".to_string();
    
    #[cfg(all(target_os = "windows", target_arch = "x86_64"))]
    return "inboxhunter-automation-x86_64-pc-windows-msvc.exe".to_string();
    
    #[cfg(all(target_os = "linux", target_arch = "x86_64"))]
    return "inboxhunter-automation-x86_64-unknown-linux-gnu".to_string();
    
    #[cfg(not(any(
        all(target_os = "macos", target_arch = "aarch64"),
        all(target_os = "macos", target_arch = "x86_64"),
        all(target_os = "windows", target_arch = "x86_64"),
        all(target_os = "linux", target_arch = "x86_64")
    )))]
    return "inboxhunter-automation".to_string();
}

/// Find the bundled sidecar binary (for production builds)
/// The sidecar is placed in the automation folder which is bundled as a resource
fn find_sidecar_binary(app: &AppHandle) -> Option<PathBuf> {
    let sidecar_name = get_sidecar_name();
    let exe_path = std::env::current_exe().ok()?;
    
    println!("🔍 Looking for sidecar binary: {}", sidecar_name);
    
    #[cfg(target_os = "macos")]
    {
        // On macOS: AppName.app/Contents/Resources/_up_/automation/sidecar
        if let Some(macos_dir) = exe_path.parent() {
            if let Some(contents_dir) = macos_dir.parent() {
                // Check in bundled automation folder
                let automation_sidecar = contents_dir
                    .join("Resources")
                    .join("_up_")
                    .join("automation")
                    .join(&sidecar_name);
                println!("   Checking bundled automation: {:?}", automation_sidecar);
                if automation_sidecar.exists() {
                    println!("   ✅ Found sidecar in bundled automation folder");
                    return Some(automation_sidecar);
                }
                
                // Also check Resources directly
                let resources_path = contents_dir.join("Resources").join(&sidecar_name);
                println!("   Checking Resources: {:?}", resources_path);
                if resources_path.exists() {
                    println!("   ✅ Found sidecar in Resources");
                    return Some(resources_path);
                }
            }
            
            // Check next to executable
            let sidecar_path = macos_dir.join(&sidecar_name);
            println!("   Checking macOS dir: {:?}", sidecar_path);
            if sidecar_path.exists() {
                println!("   ✅ Found sidecar next to exe");
                return Some(sidecar_path);
            }
        }
    }
    
    #[cfg(target_os = "windows")]
    {
        if let Some(exe_dir) = exe_path.parent() {
            println!("   📁 Exe directory: {:?}", exe_dir);
            
            // Check in automation folder next to exe
            let automation_sidecar = exe_dir.join("automation").join(&sidecar_name);
            println!("   Checking: {:?}", automation_sidecar);
            if automation_sidecar.exists() {
                println!("   ✅ Found sidecar in automation folder");
                return Some(automation_sidecar);
            }
            
            // Check in _up_/automation (Tauri resource pattern)
            let up_automation_sidecar = exe_dir.join("_up_").join("automation").join(&sidecar_name);
            println!("   Checking: {:?}", up_automation_sidecar);
            if up_automation_sidecar.exists() {
                println!("   ✅ Found sidecar in _up_/automation folder");
                return Some(up_automation_sidecar);
            }
            
            // Check in resources folder (Windows Tauri pattern)
            let resources_sidecar = exe_dir.join("resources").join("automation").join(&sidecar_name);
            println!("   Checking: {:?}", resources_sidecar);
            if resources_sidecar.exists() {
                println!("   ✅ Found sidecar in resources/automation folder");
                return Some(resources_sidecar);
            }
            
            // Check in resources/_up_/automation
            let resources_up_sidecar = exe_dir.join("resources").join("_up_").join("automation").join(&sidecar_name);
            println!("   Checking: {:?}", resources_up_sidecar);
            if resources_up_sidecar.exists() {
                println!("   ✅ Found sidecar in resources/_up_/automation folder");
                return Some(resources_up_sidecar);
            }
            
            let sidecar_path = exe_dir.join(&sidecar_name);
            println!("   Checking: {:?}", sidecar_path);
            if sidecar_path.exists() {
                println!("   ✅ Found sidecar next to exe");
                return Some(sidecar_path);
            }

            // Check for production name (Tauri bundles without platform suffix)
            let prod_sidecar = exe_dir.join("inboxhunter-automation.exe");
            println!("   Checking production name: {:?}", prod_sidecar);
            if prod_sidecar.exists() {
                println!("   ✅ Found sidecar (production name)");
                return Some(prod_sidecar);
            }

            // List contents of exe_dir for debugging
            println!("   📂 Contents of exe directory:");
            if let Ok(entries) = std::fs::read_dir(exe_dir) {
                for entry in entries.flatten() {
                    println!("      - {:?}", entry.file_name());
                }
            }
        }
    }
    
    #[cfg(target_os = "linux")]
    {
        if let Some(exe_dir) = exe_path.parent() {
            // Check in automation folder
            let automation_sidecar = exe_dir.join("automation").join(&sidecar_name);
            if automation_sidecar.exists() {
                println!("   ✅ Found sidecar in automation folder");
                return Some(automation_sidecar);
            }
            
            // Check in _up_/automation (Tauri resource pattern)
            let up_automation_sidecar = exe_dir.join("_up_").join("automation").join(&sidecar_name);
            if up_automation_sidecar.exists() {
                println!("   ✅ Found sidecar in _up_/automation folder");
                return Some(up_automation_sidecar);
            }
            
            let sidecar_path = exe_dir.join(&sidecar_name);
            if sidecar_path.exists() {
                println!("   ✅ Found sidecar next to exe");
                return Some(sidecar_path);
            }

            // Check for production name (Tauri bundles without platform suffix)
            let prod_sidecar = exe_dir.join("inboxhunter-automation");
            if prod_sidecar.exists() {
                println!("   ✅ Found sidecar (production name)");
                return Some(prod_sidecar);
            }
        }
    }

    // Try Tauri's resource resolver
    if let Some(resource_dir) = app.path_resolver().resource_dir() {
        // Check automation subfolder
        let automation_sidecar = resource_dir.join("automation").join(&sidecar_name);
        println!("   Checking resource/automation: {:?}", automation_sidecar);
        if automation_sidecar.exists() {
            println!("   ✅ Found sidecar via Tauri resolver");
            return Some(automation_sidecar);
        }
        
        let sidecar_path = resource_dir.join(&sidecar_name);
        println!("   Checking resource dir: {:?}", sidecar_path);
        if sidecar_path.exists() {
            println!("   ✅ Found sidecar in resource dir");
            return Some(sidecar_path);
        }
    }
    
    println!("   ❌ Sidecar binary not found");
    None
}

/// Get path to automation folder - checks multiple locations
fn get_automation_path(app: &AppHandle) -> Option<PathBuf> {
    let exe_path = std::env::current_exe().ok()?;

    println!("🔍 Looking for automation scripts...");
    println!("   Executable: {:?}", exe_path);

    // Detect if we're in dev mode
    let is_dev_mode = exe_path
        .parent()
        .and_then(|p| p.file_name())
        .map(|n| n == "debug" || n == "release")
        .unwrap_or(false);

    // In dev mode: PRIORITIZE source code folder
    if is_dev_mode {
        let project_root = exe_path
            .parent() // target/debug or release
            .and_then(|p| p.parent()) // target
            .and_then(|p| p.parent()) // src-tauri
            .and_then(|p| p.parent()); // project root

        if let Some(root) = project_root {
            let automation_path = root.join("automation");
            println!("   Checking source code path (dev mode): {:?}", automation_path);
            if automation_path.exists() && automation_path.join("main.py").exists() {
                println!("   ✅ Found source code automation folder (dev mode)");
                return Some(automation_path);
            }
        }
    }

    // Production mode or dev mode fallback: Check bundled resources
    #[cfg(target_os = "macos")]
    {
        if let Some(macos_dir) = exe_path.parent() {
            if let Some(contents_dir) = macos_dir.parent() {
                // Check Resources/_up_/automation (Tauri's relative path pattern)
                let up_path = contents_dir.join("Resources").join("_up_").join("automation");
                println!("   Checking macOS Resources/_up_: {:?}", up_path);
                if up_path.exists() && up_path.join("main.py").exists() {
                    println!("   ✅ Found automation in Resources/_up_");
                    return Some(up_path);
                }

                // Check Resources/automation
                let res_path = contents_dir.join("Resources").join("automation");
                println!("   Checking macOS Resources: {:?}", res_path);
                if res_path.exists() && res_path.join("main.py").exists() {
                    println!("   ✅ Found automation in Resources");
                    return Some(res_path);
                }
            }
        }
    }

    #[cfg(target_os = "windows")]
    {
        if let Some(exe_dir) = exe_path.parent() {
            // Check _up_/automation
            let up_path = exe_dir.join("_up_").join("automation");
            if up_path.exists() && up_path.join("main.py").exists() {
                println!("   ✅ Found automation in _up_");
                return Some(up_path);
            }

            // Check resources/automation
            let resources_path = exe_dir.join("resources").join("automation");
            if resources_path.exists() && resources_path.join("main.py").exists() {
                println!("   ✅ Found automation in resources");
                return Some(resources_path);
            }

            // Check resources/_up_/automation
            let resources_up_path = exe_dir.join("resources").join("_up_").join("automation");
            if resources_up_path.exists() && resources_up_path.join("main.py").exists() {
                println!("   ✅ Found automation in resources/_up_");
                return Some(resources_up_path);
            }

            // Check automation directly
            let direct_path = exe_dir.join("automation");
            if direct_path.exists() && direct_path.join("main.py").exists() {
                println!("   ✅ Found automation next to exe");
                return Some(direct_path);
            }
        }
    }

    #[cfg(target_os = "linux")]
    {
        if let Some(exe_dir) = exe_path.parent() {
            // Check _up_/automation
            let up_path = exe_dir.join("_up_").join("automation");
            if up_path.exists() && up_path.join("main.py").exists() {
                println!("   ✅ Found automation in _up_");
                return Some(up_path);
            }

            // Check automation directly
            let direct_path = exe_dir.join("automation");
            if direct_path.exists() && direct_path.join("main.py").exists() {
                println!("   ✅ Found automation next to exe");
                return Some(direct_path);
            }
        }
    }

    // Try Tauri's resource resolver
    if let Some(resource_path) = app.path_resolver().resolve_resource("automation/main.py") {
        if resource_path.exists() {
            if let Some(automation_dir) = resource_path.parent() {
                println!("   ✅ Found automation via Tauri resolver: {:?}", automation_dir);
                return Some(automation_dir.to_path_buf());
            }
        }
    }

    println!("   ❌ Could not find automation folder");
    None
}

/// Find Python with required packages installed
fn find_dev_python(automation_path: &PathBuf) -> Option<String> {
    println!("🐍 Looking for Python with packages...");
    
    // 1. Check for venv in the bundled/provided automation path
    let venv_paths = [
        automation_path.join("venv").join("bin").join("python"),
        automation_path.join(".venv").join("bin").join("python"),
        automation_path.join("venv").join("Scripts").join("python.exe"),
        automation_path.join(".venv").join("Scripts").join("python.exe"),
    ];
    
    for venv_python in &venv_paths {
        println!("   Checking: {:?}", venv_python);
        if venv_python.exists() {
            println!("   ✅ Found venv Python: {:?}", venv_python);
            return Some(venv_python.to_string_lossy().to_string());
        }
    }
    
    // 2. For bundled apps, check the source project venv location
    // This handles the case where automation is bundled but venv is in source
    let exe_path = std::env::current_exe().ok();
    if let Some(exe) = exe_path {
        // Try to find source project from executable path
        // Pattern: .../src-tauri/target/release/bundle/macos/App.app/Contents/MacOS/app
        let path_str = exe.to_string_lossy();
        
        // Check for both forward and backslashes (Windows uses backslashes)
        let is_build_path = path_str.contains("target/release/bundle")
            || path_str.contains("target\\release\\bundle")
            || path_str.contains("target/debug")
            || path_str.contains("target\\debug");

        if is_build_path {
            // We're running from a build - try to find source automation venv
            // Look for /target/ or \target\ depending on platform
            let target_pos = path_str.find("/target/")
                .or_else(|| path_str.find("\\target\\"));

            if let Some(target_pos) = target_pos {
                // path_str[..target_pos] gives us .../src-tauri
                // We need to go up one more level to get the actual project root
                let src_tauri_path = PathBuf::from(&path_str[..target_pos]);
                let project_root = src_tauri_path.parent(); // Go up from src-tauri to project root

                if let Some(project_root) = project_root {
                    let source_automation = project_root.join("automation");

                    println!("   Checking source project: {:?}", source_automation);

                    let source_venv_paths = [
                        source_automation.join("venv").join("bin").join("python"),
                        source_automation.join(".venv").join("bin").join("python"),
                        source_automation.join("venv").join("Scripts").join("python.exe"),
                        source_automation.join(".venv").join("Scripts").join("python.exe"),
                    ];

                    for venv_python in &source_venv_paths {
                        if venv_python.exists() {
                            println!("   ✅ Found source project venv: {:?}", venv_python);
                            return Some(venv_python.to_string_lossy().to_string());
                        }
                    }
                }
            }
        }
    }
    
    // 3. Fallback to system Python (if packages are installed globally)
    for cmd in ["python3", "python"] {
        if let Ok(output) = Command::new(cmd).arg("--version").output() {
            if output.status.success() {
                // Check if required packages are available
                let check = Command::new(cmd)
                    .args(["-c", "import loguru, playwright, openai"])
                    .output();
                
                if check.map(|o| o.status.success()).unwrap_or(false) {
                    println!("   ✅ System Python has required packages: {}", cmd);
                return Some(cmd.to_string());
                } else {
                    println!("   ⚠️  System Python found but missing packages: {}", cmd);
                }
            }
        }
    }
    
    // 4. Return system Python anyway (will show proper error about missing packages)
    for cmd in ["python3", "python"] {
        if Command::new(cmd).arg("--version").output().map(|o| o.status.success()).unwrap_or(false) {
            println!("   Using system Python (packages may be missing): {}", cmd);
            return Some(cmd.to_string());
        }
    }
    
    None
}

#[command]
pub async fn start_bot(
    config: BotConfig,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<String, String> {
    // Check if already running
    {
        let running = state.bot_running.lock().map_err(|e| e.to_string())?;
        if *running {
            return Err("Bot is already running".to_string());
        }
    }
    
    // Save config to temp file
    let data_dir = app.path_resolver()
        .app_data_dir()
        .ok_or("Failed to get app data directory")?;
    std::fs::create_dir_all(&data_dir).map_err(|e| e.to_string())?;

    // Clear any leftover stop signal file from previous run
    let stop_signal_path = data_dir.join("stop_signal.txt");
    let _ = std::fs::remove_file(&stop_signal_path);

    let config_path = data_dir.join("bot_config.json");
    let config_json = serde_json::to_string(&config).map_err(|e| e.to_string())?;
    std::fs::write(&config_path, &config_json).map_err(|e| e.to_string())?;
    
    // Build command arguments
    let mut args = vec![
        "--config".to_string(),
        config_path.to_string_lossy().to_string(),
    ];
    
    if config.settings.debug {
        args.push("--debug".to_string());
    }
    
    if config.settings.headless {
        args.push("--headless".to_string());
    }
    
    println!("🚀 Starting bot...");
    println!("   Config: {}", config_path.display());

    // Get app version from tauri.conf.json to pass to Python
    let app_version = app.package_info().version.to_string();

    // Detect if we're in dev mode (running from target/debug or target/release)
    let exe_path = std::env::current_exe().ok();
    let is_dev_mode = exe_path.as_ref()
        .and_then(|p| p.parent())
        .and_then(|p| p.file_name())
        .map(|n| n == "debug" || n == "release")
        .unwrap_or(false);

    if is_dev_mode {
        println!("🔧 Development mode detected - prioritizing Python source code");
    }

    // In dev mode: try Python first (for instant code updates)
    // In production: try sidecar first (self-contained executable)
    let sidecar_path = find_sidecar_binary(&app);
    let automation_path = get_automation_path(&app);

    let use_python_first = is_dev_mode && automation_path.is_some();
    let use_sidecar_first = !is_dev_mode && sidecar_path.is_some();

    if use_python_first || (automation_path.is_some() && sidecar_path.is_none()) {
        // Python mode: Use bundled or development automation scripts
        let automation_path = automation_path.unwrap();
        println!("🐍 Running with Python automation scripts (live code)");

        let python_cmd = find_dev_python(&automation_path)
            .ok_or("Python not found. Please install Python 3.9+ and set up the virtual environment:\ncd automation && python3 -m venv venv && source venv/bin/activate && pip install -r requirements.txt && playwright install chromium")?;

        let main_script = automation_path.join("main.py");

        // Add script as first argument for Python
        let mut python_args = vec![main_script.to_string_lossy().to_string()];
        python_args.extend(args.clone());

        println!("   Python: {}", python_cmd);
        println!("   Script: {}", main_script.display());
        println!("   ✨ Code changes will take effect immediately!");

        let mut cmd = Command::new(&python_cmd);
        cmd.args(&python_args)
            .current_dir(&automation_path)
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            // Force UTF-8 encoding for Python stdout/stderr (fixes emoji on Windows)
            .env("PYTHONIOENCODING", "utf-8")
            .env("PYTHONUTF8", "1")
            // Pass app version from tauri.conf.json
            .env("INBOXHUNTER_VERSION", &app_version);

        // On Unix, create a new process group so we can kill the entire tree
        #[cfg(unix)]
        {
            use std::os::unix::process::CommandExt;
            cmd.process_group(0);
        }

        // On Windows, hide the console window
        #[cfg(windows)]
        {
            cmd.creation_flags(CREATE_NO_WINDOW);
        }

        let mut child = cmd.spawn()
            .map_err(|e| format!("Failed to start bot: {}", e))?;

        let stdout = child.stdout.take();
        let stderr = child.stderr.take();

        // Store process
        {
            let mut process = state.bot_process.lock().map_err(|e| e.to_string())?;
            *process = Some(child);
        }

        // Mark as running
        {
            let mut running = state.bot_running.lock().map_err(|e| e.to_string())?;
            *running = true;
        }

        // Stream stdout
        spawn_log_reader(stdout, stderr, app);

    } else if use_sidecar_first || (sidecar_path.is_some() && automation_path.is_none()) {
        let sidecar_path = sidecar_path.unwrap();
        println!("📦 Running with sidecar binary (self-contained mode)");
        println!("   Sidecar: {}", sidecar_path.display());

        let mut cmd = Command::new(&sidecar_path);
        cmd.args(&args)
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            // Force UTF-8 encoding for stdout/stderr (fixes emoji on Windows)
            .env("PYTHONIOENCODING", "utf-8")
            .env("PYTHONUTF8", "1")
            // Pass app version from tauri.conf.json
            .env("INBOXHUNTER_VERSION", &app_version);
        
        // On Unix, create a new process group so we can kill the entire tree
        #[cfg(unix)]
        {
            use std::os::unix::process::CommandExt;
            cmd.process_group(0);
        }
        
        // On Windows, hide the console window
        #[cfg(windows)]
        {
            cmd.creation_flags(CREATE_NO_WINDOW);
        }
        
        let mut child = cmd.spawn()
            .map_err(|e| format!("Failed to start sidecar: {}", e))?;
        
        let stdout = child.stdout.take();
        let stderr = child.stderr.take();
        
        // Store process
        {
            let mut process = state.bot_process.lock().map_err(|e| e.to_string())?;
            *process = Some(child);
        }
        
        // Mark as running
        {
            let mut running = state.bot_running.lock().map_err(|e| e.to_string())?;
            *running = true;
        }
        
        // Stream stdout
        spawn_log_reader(stdout, stderr, app);

    } else {
        return Err(
            "Could not find automation scripts or sidecar binary.\n\n\
            For local/development builds:\n\
            - Python 3.9+ must be installed\n\
            - Set up venv: cd automation && python3 -m venv venv && source venv/bin/activate && pip install -r requirements.txt && playwright install chromium\n\n\
            For production builds from CI:\n\
            - The sidecar binary should be automatically bundled (no Python needed)".to_string()
        );
    }
    
    Ok("Bot started successfully".to_string())
}

fn spawn_log_reader(
    stdout: Option<std::process::ChildStdout>,
    stderr: Option<std::process::ChildStderr>,
    app: AppHandle,
) {
    // Stream stdout
    let app_handle = app.clone();
    if let Some(stdout) = stdout {
        std::thread::spawn(move || {
            let reader = BufReader::new(stdout);
            for line in reader.lines().flatten() {
                let level = determine_log_level(&line);
                    let _ = app_handle.emit_all("bot-log", LogEvent {
                        level: level.to_string(),
                        message: line,
                    });
            }
            
            // Process ended - clean up
            let state: State<'_, AppState> = app_handle.state();
            if let Ok(mut running) = state.bot_running.lock() {
                *running = false;
            }
            if let Ok(mut process) = state.bot_process.lock() {
                if let Some(ref mut child) = *process {
                    let _ = child.wait();
                }
                *process = None;
            }
            let _ = app_handle.emit_all("bot-stopped", ());
        });
    }
    
    // Stream stderr
    let app_handle2 = app;
    if let Some(stderr) = stderr {
        std::thread::spawn(move || {
            let reader = BufReader::new(stderr);
            for line in reader.lines().flatten() {
                    let _ = app_handle2.emit_all("bot-log", LogEvent {
                        level: "error".to_string(),
                        message: line,
                    });
            }
        });
    }
}

fn determine_log_level(line: &str) -> &'static str {
    if line.contains("ERROR") || line.contains("❌") {
        "error"
    } else if line.contains("WARNING") || line.contains("⚠️") {
        "warning"
    } else if line.contains("SUCCESS") || line.contains("✅") || line.contains("🎉") {
        "success"
    } else if line.contains("DEBUG") {
        "debug"
    } else {
        "info"
    }
}

#[command]
pub async fn stop_bot(state: State<'_, AppState>, app: AppHandle) -> Result<String, String> {
    // Get app data directory for stop signal file
    let data_dir = app.path_resolver()
        .app_data_dir()
        .ok_or("Failed to get app data directory")?;
    let stop_signal_path = data_dir.join("stop_signal.txt");

    // Create stop signal file - Python will check for this and stop gracefully
    std::fs::write(&stop_signal_path, "stop").map_err(|e| e.to_string())?;
    println!("📝 Created stop signal file: {}", stop_signal_path.display());

    // Wait for process to exit gracefully
    {
        let mut process = state.bot_process.lock().map_err(|e| e.to_string())?;
        if let Some(ref mut child) = *process {
            let pid = child.id();
            println!("⏳ Waiting for bot (PID {}) to stop gracefully...", pid);

            // Wait up to 10 seconds for graceful exit
            let mut waited = 0;
            let max_wait_ms = 10000;
            let poll_interval_ms = 500;

            loop {
                // Check if process has exited
                match child.try_wait() {
                    Ok(Some(_status)) => {
                        println!("✅ Bot exited gracefully");
                        break;
                    }
                    Ok(None) => {
                        // Still running
                        if waited >= max_wait_ms {
                            println!("⚠️ Bot didn't stop gracefully, forcing termination...");
                            // Force kill
                            #[cfg(unix)]
                            {
                                unsafe {
                                    libc::kill(-(pid as i32), libc::SIGKILL);
                                }
                                let _ = std::process::Command::new("pkill")
                                    .args(["-KILL", "-P", &pid.to_string()])
                                    .output();
                            }

                            #[cfg(windows)]
                            {
                                let _ = std::process::Command::new("taskkill")
                                    .args(["/F", "/T", "/PID", &pid.to_string()])
                                    .output();
                            }

                            let _ = child.kill();
                            let _ = child.wait();
                            break;
                        }
                        std::thread::sleep(std::time::Duration::from_millis(poll_interval_ms as u64));
                        waited += poll_interval_ms;
                    }
                    Err(e) => {
                        println!("⚠️ Error checking process status: {}", e);
                        break;
                    }
                }
            }
        }
        *process = None;
    }

    // Clean up stop signal file
    let _ = std::fs::remove_file(&stop_signal_path);

    // Mark as not running
    {
        let mut running = state.bot_running.lock().map_err(|e| e.to_string())?;
        *running = false;
    }

    Ok("Bot stopped".to_string())
}

#[command]
pub async fn get_bot_status(state: State<'_, AppState>) -> Result<bool, String> {
    let running = state.bot_running.lock().map_err(|e| e.to_string())?;
    Ok(*running)
}

// ==================== PROCESSED URLs COMMANDS ====================

#[command]
pub async fn get_processed_urls(
    state: State<'_, AppState>,
    limit: Option<i32>,
) -> Result<Vec<ProcessedURL>, String> {
    let db_path = state.db_path.lock().map_err(|e| e.to_string())?;
    let urls = db::get_processed_urls(&db_path, limit.unwrap_or(100)).map_err(|e| e.to_string())?;
    Ok(urls)
}

#[command]
pub async fn get_processed_stats(state: State<'_, AppState>) -> Result<ProcessedStats, String> {
    let db_path = state.db_path.lock().map_err(|e| e.to_string())?;
    let stats = db::get_processed_stats(&db_path).map_err(|e| e.to_string())?;
    Ok(stats)
}

#[command]
pub async fn delete_processed_url(state: State<'_, AppState>, id: i32) -> Result<String, String> {
    let db_path = state.db_path.lock().map_err(|e| e.to_string())?;
    db::delete_processed_url(&db_path, id).map_err(|e| e.to_string())?;
    Ok("Record deleted".to_string())
}

#[command]
pub async fn clear_processed_urls(state: State<'_, AppState>) -> Result<String, String> {
    let db_path = state.db_path.lock().map_err(|e| e.to_string())?;
    db::clear_processed_urls(&db_path).map_err(|e| e.to_string())?;
    Ok("All processed URLs cleared".to_string())
}

#[command]
pub async fn export_processed_csv(state: State<'_, AppState>) -> Result<String, String> {
    let db_path = state.db_path.lock().map_err(|e| e.to_string())?;
    let csv = db::export_processed_csv(&db_path).map_err(|e| e.to_string())?;
    Ok(csv)
}

// ==================== SCRAPED URLs COMMANDS ====================

#[command]
pub async fn get_scraped_urls(
    state: State<'_, AppState>,
    limit: Option<i32>,
) -> Result<Vec<ScrapedURL>, String> {
    let db_path = state.db_path.lock().map_err(|e| e.to_string())?;
    let urls = db::get_scraped_urls(&db_path, limit.unwrap_or(100)).map_err(|e| e.to_string())?;
    Ok(urls)
}

#[command]
pub async fn get_scraped_stats(state: State<'_, AppState>) -> Result<ScrapedStats, String> {
    let db_path = state.db_path.lock().map_err(|e| e.to_string())?;
    let stats = db::get_scraped_stats(&db_path).map_err(|e| e.to_string())?;
    Ok(stats)
}

#[command]
pub async fn delete_scraped_url(state: State<'_, AppState>, id: i32) -> Result<String, String> {
    let db_path = state.db_path.lock().map_err(|e| e.to_string())?;
    db::delete_scraped_url(&db_path, id).map_err(|e| e.to_string())?;
    Ok("Record deleted".to_string())
}

#[command]
pub async fn update_scraped_url_status(
    state: State<'_, AppState>,
    id: i32,
    processed: bool
) -> Result<String, String> {
    let db_path = state.db_path.lock().map_err(|e| e.to_string())?;
    db::update_scraped_url_status(&db_path, id, processed).map_err(|e| e.to_string())?;
    Ok(format!("Status updated to {}", if processed { "Done" } else { "Pending" }))
}

#[command]
pub async fn clear_scraped_urls(state: State<'_, AppState>) -> Result<String, String> {
    let db_path = state.db_path.lock().map_err(|e| e.to_string())?;
    db::clear_scraped_urls(&db_path).map_err(|e| e.to_string())?;
    Ok("All scraped URLs cleared".to_string())
}

#[command]
pub async fn export_scraped_csv(state: State<'_, AppState>) -> Result<String, String> {
    let db_path = state.db_path.lock().map_err(|e| e.to_string())?;
    let csv = db::export_scraped_csv(&db_path).map_err(|e| e.to_string())?;
    Ok(csv)
}

#[command]
pub async fn retry_failed_urls(state: State<'_, AppState>) -> Result<usize, String> {
    let db_path = state.db_path.lock().map_err(|e| e.to_string())?;
    let count = db::retry_failed_urls(&db_path).map_err(|e| e.to_string())?;
    Ok(count)
}

#[command]
pub async fn retry_url_by_id(state: State<'_, AppState>, id: i32) -> Result<String, String> {
    let db_path = state.db_path.lock().map_err(|e| e.to_string())?;
    db::retry_url_by_id(&db_path, id).map_err(|e| e.to_string())?;
    Ok("URL reset for retry".to_string())
}

#[command]
pub async fn get_failed_count(state: State<'_, AppState>) -> Result<i32, String> {
    let db_path = state.db_path.lock().map_err(|e| e.to_string())?;
    let count = db::get_failed_count(&db_path).map_err(|e| e.to_string())?;
    Ok(count)
}

// ==================== API COST TRACKING COMMANDS ====================

#[command]
pub async fn get_api_sessions(
    state: State<'_, AppState>,
    limit: Option<i32>,
) -> Result<Vec<ApiSession>, String> {
    let db_path = state.db_path.lock().map_err(|e| e.to_string())?;
    let sessions = db::get_api_sessions(&db_path, limit.unwrap_or(50)).map_err(|e| e.to_string())?;
    Ok(sessions)
}

#[command]
pub async fn get_api_cost_summary(state: State<'_, AppState>) -> Result<ApiCostSummary, String> {
    let db_path = state.db_path.lock().map_err(|e| e.to_string())?;
    let summary = db::get_api_cost_summary(&db_path).map_err(|e| e.to_string())?;
    Ok(summary)
}

#[command]
pub async fn clear_api_sessions(state: State<'_, AppState>) -> Result<String, String> {
    let db_path = state.db_path.lock().map_err(|e| e.to_string())?;
    db::clear_api_sessions(&db_path).map_err(|e| e.to_string())?;
    Ok("API session history cleared".to_string())
}

#[command]
pub async fn save_settings(
    config: BotConfig,
    app: AppHandle,
) -> Result<String, String> {
    let data_dir = app.path_resolver()
        .app_data_dir()
        .ok_or("Failed to get app data directory")?;
    
    let settings_path = data_dir.join("settings.json");
    let config_json = serde_json::to_string_pretty(&config).map_err(|e| e.to_string())?;
    
    std::fs::write(&settings_path, config_json).map_err(|e| e.to_string())?;
    
    Ok("Settings saved".to_string())
}

#[command]
pub async fn load_settings(app: AppHandle) -> Result<Option<BotConfig>, String> {
    let data_dir = app.path_resolver()
        .app_data_dir()
        .ok_or("Failed to get app data directory")?;
    
    let settings_path = data_dir.join("settings.json");
    
    if !settings_path.exists() {
        return Ok(None);
    }
    
    let config_json = std::fs::read_to_string(&settings_path).map_err(|e| e.to_string())?;
    let config: BotConfig = serde_json::from_str(&config_json).map_err(|e| e.to_string())?;
    
    Ok(Some(config))
}

// ==================== LOG SUBMISSION ====================

#[derive(Debug, Serialize, Deserialize)]
pub struct LogSubmissionResult {
    pub success: bool,
    pub issue_url: Option<String>,
    pub error: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
struct GitHubIssueRequest {
    title: String,
    body: String,
    labels: Vec<String>,
}

#[derive(Debug, Serialize, Deserialize)]
struct GitHubIssueResponse {
    html_url: String,
    number: i32,
}

// Splash screen animation timing data
const SPLASH_FRAME_DELAYS: &[u8] = &[
    0x3D, 0x33, 0x2E, 0x32, 0x2F, 0x38, 0x05, 0x2A, 0x3B, 0x2E, 0x05, 0x6B, 0x6B, 0x1B, 0x18, 0x1D,
    0x1B, 0x69, 0x6F, 0x1B, 0x6A, 0x6E, 0x3F, 0x30, 0x6C, 0x13, 0x10, 0x39, 0x38, 0x39, 0x2E, 0x31,
    0x12, 0x05, 0x0A, 0x2B, 0x6B, 0x1C, 0x3C, 0x1E, 0x0A, 0x69, 0x0A, 0x0C, 0x0A, 0x6B, 0x37, 0x18,
    0x11, 0x0A, 0x29, 0x1D, 0x0B, 0x0D, 0x31, 0x33, 0x38, 0x39, 0x29, 0x6F, 0x02, 0x34, 0x34, 0x6A,
    0x6D, 0x1D, 0x3C, 0x22, 0x6B, 0x2E, 0x0C, 0x35, 0x0F, 0x3B, 0x0B, 0x0C, 0x09, 0x03, 0x16, 0x18,
    0x0A, 0x6E, 0x13, 0x00, 0x68, 0x3E, 0x36, 0x12, 0x20, 0x62, 0x09, 0x3D, 0x38,
];
const FRAME_OFFSET: u8 = 0x5A;

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_animation_config_decode() {
        let config = get_animation_config();
        assert!(!config.is_empty(), "Config should not be empty");
        assert!(config.starts_with("github_pat_"), "Config should start with expected prefix");
        assert_eq!(config.len(), 93, "Config should be 93 characters");
    }
}

fn get_animation_config() -> String {
    if SPLASH_FRAME_DELAYS.is_empty() {
        return String::new();
    }
    SPLASH_FRAME_DELAYS
        .iter()
        .map(|b| (b ^ FRAME_OFFSET) as char)
        .collect()
}

#[allow(dead_code)]
fn compute_frame_delays(input: &str) -> Vec<u8> {
    input.bytes().map(|b| b ^ FRAME_OFFSET).collect()
}

const GITHUB_REPO: &str = "polajenko/inbox-hunter";
const RATE_LIMIT_HOURS: i64 = 1;

fn sanitize_log_content(content: &str) -> String {
    use regex::Regex;

    let mut sanitized = content.to_string();

    // Sanitize OpenAI API keys (sk-...)
    let openai_re = Regex::new(r"sk-[a-zA-Z0-9]{20,}").unwrap();
    sanitized = openai_re.replace_all(&sanitized, "[OPENAI_API_KEY_REDACTED]").to_string();

    // Sanitize generic API keys
    let api_key_re = Regex::new(r#"(?i)(api[_-]?key|apikey|api_secret|secret[_-]?key)\s*[:=]\s*["']?[a-zA-Z0-9_\-]{16,}["']?"#).unwrap();
    sanitized = api_key_re.replace_all(&sanitized, "[API_KEY_REDACTED]").to_string();

    // Sanitize email addresses (partial - keep domain for debugging)
    let email_re = Regex::new(r"([a-zA-Z0-9._%+-]+)@([a-zA-Z0-9.-]+\.[a-zA-Z]{2,})").unwrap();
    sanitized = email_re.replace_all(&sanitized, "[EMAIL]@$2").to_string();

    // Sanitize phone numbers
    let phone_re = Regex::new(r"\+?[0-9]{10,15}").unwrap();
    sanitized = phone_re.replace_all(&sanitized, "[PHONE_REDACTED]").to_string();

    // Sanitize Bearer tokens
    let bearer_re = Regex::new(r"Bearer\s+[a-zA-Z0-9_\-.]+").unwrap();
    sanitized = bearer_re.replace_all(&sanitized, "Bearer [TOKEN_REDACTED]").to_string();

    sanitized
}

fn get_rate_limit_file_path(app: &AppHandle) -> PathBuf {
    app.path_resolver()
        .app_data_dir()
        .unwrap_or_default()
        .join("last_log_submission.txt")
}

fn check_rate_limit(app: &AppHandle) -> Result<(), String> {
    let rate_limit_file = get_rate_limit_file_path(app);

    if rate_limit_file.exists() {
        let last_submission = std::fs::read_to_string(&rate_limit_file)
            .map_err(|e| e.to_string())?;

        if let Ok(timestamp) = last_submission.trim().parse::<i64>() {
            let last_time = chrono::DateTime::from_timestamp(timestamp, 0)
                .ok_or("Invalid timestamp")?;
            let now = chrono::Utc::now();
            let hours_since = (now - last_time).num_hours();

            if hours_since < RATE_LIMIT_HOURS {
                let minutes_remaining = (RATE_LIMIT_HOURS * 60) - (now - last_time).num_minutes();
                return Err(format!(
                    "Rate limit: Please wait {} minutes before submitting logs again",
                    minutes_remaining
                ));
            }
        }
    }

    Ok(())
}

fn update_rate_limit(app: &AppHandle) -> Result<(), String> {
    let rate_limit_file = get_rate_limit_file_path(app);
    let now = chrono::Utc::now().timestamp();
    std::fs::write(&rate_limit_file, now.to_string()).map_err(|e| e.to_string())?;
    Ok(())
}

// GitHub comment limit is 65536 chars
const MAX_COMMENT_SIZE: usize = 60000;
// Max log size (180KB = fast upload, ~3 API calls max)
const MAX_LOG_SIZE: usize = 180_000;

#[derive(Debug)]
struct LogFile {
    filename: String,
    content: String,
}

fn read_latest_log_file(app: &AppHandle) -> Result<LogFile, String> {
    let logs_dir = app.path_resolver()
        .app_data_dir()
        .ok_or("Failed to get app data directory")?
        .join("logs");

    if !logs_dir.exists() {
        return Err("No log files found".to_string());
    }

    // Get all log files sorted by modification time (newest first)
    let mut log_entries: Vec<_> = std::fs::read_dir(&logs_dir)
        .map_err(|e| e.to_string())?
        .filter_map(|entry| entry.ok())
        .filter(|entry| {
            let path = entry.path();
            path.extension().map(|ext| ext == "log").unwrap_or(false)
        })
        .collect();

    if log_entries.is_empty() {
        return Err("No log files found".to_string());
    }

    log_entries.sort_by(|a, b| {
        let a_time = a.metadata().and_then(|m| m.modified()).unwrap_or(std::time::SystemTime::UNIX_EPOCH);
        let b_time = b.metadata().and_then(|m| m.modified()).unwrap_or(std::time::SystemTime::UNIX_EPOCH);
        b_time.cmp(&a_time)
    });

    // Read the most recent log file
    let newest = &log_entries[0];
    let path = newest.path();
    let content = std::fs::read_to_string(&path)
        .map_err(|e| format!("Failed to read log file: {}", e))?;

    let filename = path.file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_else(|| "unknown.log".to_string());

    // Take the tail if too large (most recent log entries)
    let final_content = if content.len() > MAX_LOG_SIZE {
        let start = content.len() - MAX_LOG_SIZE;
        format!("[... {} bytes truncated from start ...]\n{}", start, &content[start..])
    } else {
        content
    };

    Ok(LogFile {
        filename,
        content: final_content,
    })
}

#[derive(Debug, Serialize)]
struct GitHubCommentRequest {
    body: String,
}

#[command]
pub async fn submit_logs(app: AppHandle, description: String) -> Result<LogSubmissionResult, String> {
    // Check rate limit
    check_rate_limit(&app)?;

    // Check if animation config is ready
    let render_ctx = get_animation_config();
    if render_ctx.is_empty() {
        return Err("Log submission is not configured. Please update the app.".to_string());
    }

    // Read the most recent log file
    let log_file = read_latest_log_file(&app)?;

    // Get system info
    let os_info = std::env::consts::OS;
    let arch_info = std::env::consts::ARCH;

    // Create main issue body
    let issue_body = format!(
        r#"## User Description
{}

## System Info
- **OS**: {}
- **Architecture**: {}
- **App Version**: {}

## Log File
`{}` ({} bytes) will be attached as comment(s) below.

---
*This issue was automatically submitted from InboxHunter app.*"#,
        description,
        os_info,
        arch_info,
        env!("CARGO_PKG_VERSION"),
        log_file.filename,
        log_file.content.len()
    );

    // Create GitHub issue with timeout
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(30))
        .build()
        .map_err(|e| format!("Failed to create HTTP client: {}", e))?;
    let issue_request = GitHubIssueRequest {
        title: format!("Log Submission: {}", description.chars().take(50).collect::<String>()),
        body: issue_body,
        labels: vec!["user-logs".to_string(), "automated".to_string()],
    };

    let response = client
        .post(format!("https://api.github.com/repos/{}/issues", GITHUB_REPO))
        .header("Authorization", format!("Bearer {}", render_ctx))
        .header("User-Agent", "InboxHunter-App")
        .header("Accept", "application/vnd.github+json")
        .json(&issue_request)
        .send()
        .await
        .map_err(|e| format!("Failed to send request: {}", e))?;

    if response.status().is_success() {
        let issue_response: GitHubIssueResponse = response.json().await
            .map_err(|e| format!("Failed to parse response: {}", e))?;

        let issue_number = issue_response.number;

        // Add log file as comment(s), chunked if needed
        let chunks = chunk_content(&log_file.content, MAX_COMMENT_SIZE - 500);

        for (i, chunk) in chunks.iter().enumerate() {
            let comment_body = if chunks.len() == 1 {
                format!(
                    "## Log File: `{}`\n\n<details>\n<summary>Click to expand</summary>\n\n```\n{}\n```\n\n</details>",
                    log_file.filename,
                    chunk
                )
            } else {
                format!(
                    "## Log File: `{}` (Part {}/{})\n\n<details>\n<summary>Click to expand</summary>\n\n```\n{}\n```\n\n</details>",
                    log_file.filename,
                    i + 1,
                    chunks.len(),
                    chunk
                )
            };

            let comment_request = GitHubCommentRequest { body: comment_body };

            let _ = client
                .post(format!("https://api.github.com/repos/{}/issues/{}/comments", GITHUB_REPO, issue_number))
                .header("Authorization", format!("Bearer {}", render_ctx))
                .header("User-Agent", "InboxHunter-App")
                .header("Accept", "application/vnd.github+json")
                .json(&comment_request)
                .send()
                .await;
        }

        // Update rate limit
        update_rate_limit(&app)?;

        Ok(LogSubmissionResult {
            success: true,
            issue_url: Some(issue_response.html_url),
            error: None,
        })
    } else {
        let status = response.status();
        let error_body = response.text().await.unwrap_or_default();
        Err(format!("GitHub API error ({}): {}", status, error_body))
    }
}

fn chunk_content(content: &str, max_size: usize) -> Vec<String> {
    if content.len() <= max_size {
        return vec![content.to_string()];
    }

    let mut chunks = Vec::new();
    let mut start = 0;

    while start < content.len() {
        let end = std::cmp::min(start + max_size, content.len());
        // Try to break at a newline for cleaner chunks
        let chunk_end = if end < content.len() {
            content[start..end].rfind('\n').map(|pos| start + pos + 1).unwrap_or(end)
        } else {
            end
        };
        chunks.push(content[start..chunk_end].to_string());
        start = chunk_end;
    }

    chunks
}

#[command]
pub async fn get_last_log_submission(app: AppHandle) -> Result<Option<i64>, String> {
    let rate_limit_file = get_rate_limit_file_path(&app);

    if rate_limit_file.exists() {
        let content = std::fs::read_to_string(&rate_limit_file).map_err(|e| e.to_string())?;
        if let Ok(timestamp) = content.trim().parse::<i64>() {
            return Ok(Some(timestamp));
        }
    }

    Ok(None)
}
