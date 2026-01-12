# PostToolUse hook: Clean up temporary Claude files
# These files are created during Claude operations and should not be committed

$projectDir = if ($env:CLAUDE_PROJECT_DIR) { $env:CLAUDE_PROJECT_DIR } else { "C:/s/scanner" }

# Find temp files
$files = @()
$files += Get-ChildItem -Path "$projectDir/tmpclaude-*" -File -ErrorAction SilentlyContinue
$files += Get-ChildItem -Path "$projectDir/.claude/skills/tmpclaude-*" -File -ErrorAction SilentlyContinue

if ($files.Count -gt 0) {
    $files | Remove-Item -Force -ErrorAction SilentlyContinue
    Write-Host "Cleanup: $($files.Count) temp file(s) deleted"
} else {
    Write-Host "Cleanup: No temp files found to delete"
}

exit 0
