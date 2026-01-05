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
    
    // 1. Check bundled resources (for local builds)
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
    
    // 2. Try Tauri's resource resolver
    if let Some(resource_path) = app.path_resolver().resolve_resource("automation/main.py") {
        if resource_path.exists() {
            if let Some(automation_dir) = resource_path.parent() {
                println!("   ✅ Found automation via Tauri resolver: {:?}", automation_dir);
                return Some(automation_dir.to_path_buf());
            }
        }
    }
    
    // 3. Development mode: go up from target/debug to find project root
    let project_root = exe_path
        .parent() // target/debug or release
        .and_then(|p| p.parent()) // target
        .and_then(|p| p.parent()) // src-tauri
        .and_then(|p| p.parent()); // project root
    
    if let Some(root) = project_root {
        let automation_path = root.join("automation");
        println!("   Checking dev path: {:?}", automation_path);
        if automation_path.exists() && automation_path.join("main.py").exists() {
            println!("   ✅ Found development automation folder");
            return Some(automation_path);
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
        
        if path_str.contains("target/release/bundle") || path_str.contains("target/debug") {
            // We're running from a build - try to find source automation venv
            if let Some(target_pos) = path_str.find("/target/") {
                let project_root = &path_str[..target_pos];
                let source_automation = PathBuf::from(project_root).join("automation");
                
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
    
    // Try to find sidecar binary first (CI production builds)
    if let Some(sidecar_path) = find_sidecar_binary(&app) {
        println!("📦 Running with sidecar binary (self-contained mode)");
        println!("   Sidecar: {}", sidecar_path.display());
        
        let mut cmd = Command::new(&sidecar_path);
        cmd.args(&args)
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            // Force UTF-8 encoding for stdout/stderr (fixes emoji on Windows)
            .env("PYTHONIOENCODING", "utf-8")
            .env("PYTHONUTF8", "1");
        
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
        
    } else if let Some(automation_path) = get_automation_path(&app) {
        // Python mode: Use bundled or development automation scripts
        println!("📦 Running with Python automation scripts");
        
        let python_cmd = find_dev_python(&automation_path)
            .ok_or("Python not found. Please install Python 3.9+ and set up the virtual environment:\ncd automation && python3 -m venv venv && source venv/bin/activate && pip install -r requirements.txt && playwright install chromium")?;
        
        let main_script = automation_path.join("main.py");
        
        // Add script as first argument for Python
        let mut python_args = vec![main_script.to_string_lossy().to_string()];
        python_args.extend(args);
        
        println!("   Python: {}", python_cmd);
        println!("   Script: {}", main_script.display());
        
        let mut cmd = Command::new(&python_cmd);
        cmd.args(&python_args)
        .current_dir(&automation_path)
        .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            // Force UTF-8 encoding for Python stdout/stderr (fixes emoji on Windows)
            .env("PYTHONIOENCODING", "utf-8")
            .env("PYTHONUTF8", "1");
        
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
    
        // Stream stdout/stderr
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
pub async fn stop_bot(state: State<'_, AppState>) -> Result<String, String> {
    // Kill process and all its children
    {
        let mut process = state.bot_process.lock().map_err(|e| e.to_string())?;
        if let Some(ref mut child) = *process {
            let pid = child.id();
            
            // Kill the entire process tree
            #[cfg(unix)]
            {
                // On Unix, kill the process group
                unsafe {
                    // Try to kill the process group (negative PID)
                    libc::kill(-(pid as i32), libc::SIGTERM);
                    // Give processes time to cleanup
                    std::thread::sleep(std::time::Duration::from_millis(500));
                    // Force kill if still running
                    libc::kill(-(pid as i32), libc::SIGKILL);
                }
                // Also kill by direct PID in case process group kill didn't work
                let _ = std::process::Command::new("pkill")
                    .args(["-TERM", "-P", &pid.to_string()])
                    .output();
            }
            
            #[cfg(windows)]
            {
                // On Windows, use taskkill to kill process tree
                let _ = std::process::Command::new("taskkill")
                    .args(["/F", "/T", "/PID", &pid.to_string()])
                    .output();
            }
            
            // Also try the standard kill
            let _ = child.kill();
            let _ = child.wait();
        }
        *process = None;
    }
    
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
