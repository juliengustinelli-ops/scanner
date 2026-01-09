# InboxHunter Development Guide

## Development Mode (Recommended)

**Good news!** In development mode, the app automatically uses Python source code directly - no rebuilds needed!

### How It Works

When you run `npm run tauri:dev`:
- The app detects it's in development mode
- **Automatically runs Python source code** from `automation/` folder
- **Code changes take effect immediately** - just restart the bot in the UI
- No need to rebuild the sidecar executable

This means you can:
1. Edit Python files in `automation/`
2. Click "Stop Bot" in the UI
3. Click "Start Bot" in the UI
4. Your changes are live!

### What You'll See

When the bot starts in dev mode, you'll see:
```
🔧 Development mode detected - prioritizing Python source code
🐍 Running with Python automation scripts (live code)
   ✨ Code changes will take effect immediately!
```

## Building the Python Sidecar Executable (Production Only)

The sidecar executable is only needed for production builds. The CI/CD pipeline builds this automatically.

### When You Need to Build

You only need to manually build the sidecar if:
- Testing the production build locally
- Preparing a release outside of CI/CD

### Quick Build Commands

```bash
# For production builds (goes to src-tauri/binaries/)
npm run build:sidecar

# For development (also copies to src-tauri/target/debug/)
npm run build:sidecar:dev
```

### Manual Build Process

If you need to build manually:

```bash
cd automation
python build_executable.py
```

This will:
1. Install PyInstaller and dependencies
2. Bundle all Python code and dependencies into a single executable
3. Copy the executable to `src-tauri/binaries/` for production
4. The executable is named: `inboxhunter-automation-x86_64-pc-windows-msvc.exe`

### For Development Mode

After building, copy the executable to the debug folder:

```bash
# Windows
cp automation/dist/inboxhunter-automation-x86_64-pc-windows-msvc.exe src-tauri/target/debug/inboxhunter-automation.exe

# Or use the npm script
npm run build:sidecar:dev
```

Then restart the dev server:

```bash
npm run tauri:dev
```

## Proof of Submission Feature

### Overview

The app captures proof data when forms are successfully submitted to verify that submissions actually work.

### What Gets Captured

1. **Screenshot** - Full page screenshot after submission (base64)
2. **Confirmation Data** - Success messages, confirmation elements, page title
3. **Network Data** - Final URL, page title, ready state, performance metrics

### Database Schema

Three columns added to `processed_urls` table:
- `screenshot_path` (TEXT) - Base64 screenshot data
- `confirmation_data` (TEXT) - JSON with confirmation indicators
- `network_data` (TEXT) - JSON with page response info

### Code Locations

**Backend (Python):**
- `automation/agent_orchestrator.py:1496` - `_capture_submission_proof()` function
- `automation/agent_orchestrator.py:4147` - Proof capture trigger
- `automation/database/operations.py` - Database operations
- `automation/orchestrator.py:_record_result()` - Stores proof data

**Backend (Rust):**
- `src-tauri/src/db.rs` - Database schema and migration
- `src-tauri/src/commands.rs` - ProcessedURL struct

**Frontend (React):**
- `src/pages/Database.tsx` - Proof modal and Eye icon button

### How It Works

1. **After form submission**, the bot waits 2 seconds for confirmation messages
2. **Captures screenshot** using Playwright's screenshot API
3. **Searches for confirmation indicators**:
   - Elements with classes/IDs containing "success", "confirm", "thank"
   - Text containing success keywords (11 keywords searched)
4. **Captures network data** from page state
5. **Stores all data** in database as JSON/base64
6. **Frontend displays** Eye icon 👁️ on successful submissions with proof
7. **Click Eye icon** to open modal with all proof data

### Testing Proof Capture

1. Run the bot: `npm run tauri:dev`
2. Watch logs for proof indicators:
   - 📊 "Capturing submission proof..."
   - 📸 "Screenshot captured"
   - 🔍 "Found X confirmation indicator(s)"
   - 🌐 "Network data captured"
3. Check Database tab for Eye icon on successful submissions
4. Click Eye icon to view proof modal

### Debugging Proof Capture

Check the database directly:

```python
import sqlite3
conn = sqlite3.connect('C:/Users/YOUR_USER/AppData/Roaming/com.inboxhunter.app/inboxhunter.db')
cursor = conn.cursor()

cursor.execute('''
    SELECT id, url, screenshot_path, confirmation_data, network_data
    FROM processed_urls
    WHERE status = 'success'
    ORDER BY processed_at DESC
    LIMIT 5
''')

for row in cursor.fetchall():
    id, url, screenshot, confirmation, network = row
    print(f"ID {id}: {url[:50]}")
    print(f"  Screenshot: {'YES' if screenshot else 'NO'}")
    print(f"  Confirmation: {'YES' if confirmation else 'NO'}")
    print(f"  Network: {'YES' if network else 'NO'}")
```

### Common Issues

**Issue**: Old executable being used
- **Fix**: Run `npm run build:sidecar:dev` and restart dev server

**Issue**: Screenshots showing as "base64" string
- **Fix**: The code was updated to store full base64 data (fixed in v1.2.14+)

**Issue**: Eye icon appears but modal shows "No proof data"
- **Fix**: Likely captured before proof feature was added or capture failed

**Issue**: Empty confirmation arrays
- **Fix**: The page may not have obvious success indicators, or they're loaded via JS after capture

## Version Information

This documentation applies to InboxHunter v1.2.14+
