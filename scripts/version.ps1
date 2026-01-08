# Version helper script for InboxHunter releases
# Usage:
#   .\scripts\version.ps1           - Show current version and suggestions
#   .\scripts\version.ps1 release 1.2.11  - Create a release

param(
    [string]$Command,
    [string]$NewVersion
)

# Colors
function Write-Color {
    param([string]$Text, [string]$Color = "White")
    Write-Host $Text -ForegroundColor $Color
}

# Get current version from tauri.conf.json
$tauriConfig = Get-Content "apps/inboxhunter-app/src-tauri/tauri.conf.json" | ConvertFrom-Json
$currentVersion = $tauriConfig.package.version

# Get latest tag
$latestTag = git tag -l "v*" | Sort-Object { [version]($_ -replace '^v', '') } | Select-Object -Last 1
if (-not $latestTag) { $latestTag = "none" }

# Calculate next versions
$versionParts = $currentVersion -split '\.'
$major = [int]$versionParts[0]
$minor = [int]$versionParts[1]
$patch = [int]$versionParts[2]

$nextPatch = "$major.$minor.$($patch + 1)"
$nextMinor = "$major.$($minor + 1).0"
$nextMajor = "$($major + 1).0.0"

Write-Host ""
Write-Color "=== InboxHunter Version Info ===" "Cyan"
Write-Host ""
Write-Host "Current version in config: " -NoNewline; Write-Color $currentVersion "Green"
Write-Host "Latest git tag:            " -NoNewline; Write-Color $latestTag "Green"
Write-Host ""

# Check if current version tag exists
$tagExists = git tag -l "v$currentVersion"
if ($tagExists) {
    Write-Color "Warning: Tag v$currentVersion already exists!" "Yellow"
    Write-Host ""
}

Write-Color "Suggested next versions:" "Cyan"
Write-Host "  Patch: " -NoNewline; Write-Color $nextPatch "Green" -NoNewline; Write-Host "  (bug fixes)"
Write-Host "  Minor: " -NoNewline; Write-Color $nextMinor "Green" -NoNewline; Write-Host "  (new features)"
Write-Host "  Major: " -NoNewline; Write-Color $nextMajor "Green" -NoNewline; Write-Host "  (breaking changes)"
Write-Host ""

# If release command provided
if ($Command -eq "release") {
    if (-not $NewVersion) {
        Write-Color "Usage: .\scripts\version.ps1 release <version>" "Red"
        Write-Host "Example: .\scripts\version.ps1 release $nextPatch"
        exit 1
    }

    # Check if tag already exists
    $tagExists = git tag -l "v$NewVersion"
    if ($tagExists) {
        Write-Color "Error: Tag v$NewVersion already exists!" "Red"
        exit 1
    }

    # Check for uncommitted changes
    $status = git status --porcelain
    if ($status) {
        Write-Color "Error: You have uncommitted changes. Commit or stash them first." "Red"
        exit 1
    }

    Write-Color "Updating version to $NewVersion..." "Yellow"

    # Update tauri.conf.json
    $tauriConfigPath = "apps/inboxhunter-app/src-tauri/tauri.conf.json"
    $tauriContent = Get-Content $tauriConfigPath -Raw
    $tauriContent = $tauriContent -replace "`"version`": `"$currentVersion`"", "`"version`": `"$NewVersion`""
    Set-Content $tauriConfigPath $tauriContent -NoNewline

    # Update package.json
    $packagePath = "apps/inboxhunter-app/package.json"
    $packageContent = Get-Content $packagePath -Raw
    $packageContent = $packageContent -replace "`"version`": `"$currentVersion`"", "`"version`": `"$NewVersion`""
    Set-Content $packagePath $packageContent -NoNewline

    # Update Cargo.toml
    $cargoPath = "apps/inboxhunter-app/src-tauri/Cargo.toml"
    $cargoContent = Get-Content $cargoPath -Raw
    $cargoContent = $cargoContent -replace "version = `"$currentVersion`"", "version = `"$NewVersion`""
    Set-Content $cargoPath $cargoContent -NoNewline

    Write-Color "Version files updated" "Green"

    # Commit and tag
    git add apps/inboxhunter-app/src-tauri/tauri.conf.json apps/inboxhunter-app/package.json apps/inboxhunter-app/src-tauri/Cargo.toml
    git commit -m "chore: Bump version to $NewVersion"
    git tag "v$NewVersion"

    Write-Host ""
    Write-Color "Created commit and tag v$NewVersion" "Green"
    Write-Host ""
    Write-Color "To trigger the release, run:" "Yellow"
    Write-Host "  git push origin main --tags"
    Write-Host ""
}
