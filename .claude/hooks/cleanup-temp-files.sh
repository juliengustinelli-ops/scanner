#!/bin/bash
# PostToolUse hook: Clean up temporary Claude files
# These files are created during Claude operations and should not be committed

# Get the project directory from environment or use current directory
PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$(pwd)}"

# Clean up tmpclaude-* files in project root
find "$PROJECT_DIR" -maxdepth 1 -name "tmpclaude-*" -type f -delete 2>/dev/null

# Clean up tmpclaude-* files in .claude/skills directory
find "$PROJECT_DIR/.claude/skills" -maxdepth 1 -name "tmpclaude-*" -type f -delete 2>/dev/null

# Clean up any other common temp patterns
find "$PROJECT_DIR" -maxdepth 1 -name "*.tmp" -type f -mmin +60 -delete 2>/dev/null

# Exit successfully (don't block on cleanup)
exit 0
