#!/bin/bash
# Version helper script for InboxHunter releases

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Get current version from tauri.conf.json
CURRENT_VERSION=$(grep -o '"version": "[^"]*"' apps/inboxhunter-app/src-tauri/tauri.conf.json | head -1 | cut -d'"' -f4)

# Get latest tag
LATEST_TAG=$(git tag -l "v*" | sort -V | tail -1 2>/dev/null || echo "none")

# Calculate next versions
IFS='.' read -r MAJOR MINOR PATCH <<< "$CURRENT_VERSION"
NEXT_PATCH="$MAJOR.$MINOR.$((PATCH + 1))"
NEXT_MINOR="$MAJOR.$((MINOR + 1)).0"
NEXT_MAJOR="$((MAJOR + 1)).0.0"

echo ""
echo -e "${BLUE}=== InboxHunter Version Info ===${NC}"
echo ""
echo -e "Current version in config: ${GREEN}$CURRENT_VERSION${NC}"
echo -e "Latest git tag:            ${GREEN}$LATEST_TAG${NC}"
echo ""

# Check if current version tag exists
if git tag -l "v$CURRENT_VERSION" | grep -q .; then
    echo -e "${YELLOW}Warning: Tag v$CURRENT_VERSION already exists!${NC}"
    echo ""
fi

echo -e "${BLUE}Suggested next versions:${NC}"
echo -e "  Patch: ${GREEN}$NEXT_PATCH${NC}  (bug fixes)"
echo -e "  Minor: ${GREEN}$NEXT_MINOR${NC}  (new features)"
echo -e "  Major: ${GREEN}$NEXT_MAJOR${NC}  (breaking changes)"
echo ""

# If argument provided, create release
if [ "$1" == "release" ]; then
    if [ -z "$2" ]; then
        echo -e "${RED}Usage: ./scripts/version.sh release <version>${NC}"
        echo -e "Example: ./scripts/version.sh release $NEXT_PATCH"
        exit 1
    fi

    NEW_VERSION="$2"

    # Check if tag already exists
    if git tag -l "v$NEW_VERSION" | grep -q .; then
        echo -e "${RED}Error: Tag v$NEW_VERSION already exists!${NC}"
        exit 1
    fi

    # Check for uncommitted changes
    if ! git diff-index --quiet HEAD --; then
        echo -e "${RED}Error: You have uncommitted changes. Commit or stash them first.${NC}"
        exit 1
    fi

    echo -e "${YELLOW}Updating version to $NEW_VERSION...${NC}"

    # Update all version files
    if [[ "$OSTYPE" == "darwin"* ]]; then
        # macOS
        sed -i '' "s/\"version\": \"$CURRENT_VERSION\"/\"version\": \"$NEW_VERSION\"/" apps/inboxhunter-app/src-tauri/tauri.conf.json
        sed -i '' "s/\"version\": \"$CURRENT_VERSION\"/\"version\": \"$NEW_VERSION\"/" apps/inboxhunter-app/package.json
        sed -i '' "s/version = \"$CURRENT_VERSION\"/version = \"$NEW_VERSION\"/" apps/inboxhunter-app/src-tauri/Cargo.toml
    else
        # Linux/Windows (Git Bash)
        sed -i "s/\"version\": \"$CURRENT_VERSION\"/\"version\": \"$NEW_VERSION\"/" apps/inboxhunter-app/src-tauri/tauri.conf.json
        sed -i "s/\"version\": \"$CURRENT_VERSION\"/\"version\": \"$NEW_VERSION\"/" apps/inboxhunter-app/package.json
        sed -i "s/version = \"$CURRENT_VERSION\"/version = \"$NEW_VERSION\"/" apps/inboxhunter-app/src-tauri/Cargo.toml
    fi

    echo -e "${GREEN}Version files updated${NC}"

    # Commit and tag
    git add apps/inboxhunter-app/src-tauri/tauri.conf.json apps/inboxhunter-app/package.json apps/inboxhunter-app/src-tauri/Cargo.toml
    git commit -m "chore: Bump version to $NEW_VERSION"
    git tag "v$NEW_VERSION"

    echo ""
    echo -e "${GREEN}Created commit and tag v$NEW_VERSION${NC}"
    echo ""
    echo -e "${YELLOW}To trigger the release, run:${NC}"
    echo -e "  git push origin main --tags"
    echo ""
fi
