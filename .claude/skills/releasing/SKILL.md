---
name: releasing
description: Releases new versions of InboxHunter by bumping versions, committing, tagging, and pushing to trigger CI/CD. Use when the user asks to release, tag, bump version, publish, ship, deploy to production, create a new version, or push a release. Also use proactively after completing significant features or bug fixes when the user requests a commit and mentions releasing or tagging.
---

# Releasing InboxHunter

Handles the complete release workflow for InboxHunter desktop app.

## Quick Release Steps

1. **Determine the new version number** based on semantic versioning:
   - **Patch** (1.2.10 → 1.2.11): Bug fixes, minor improvements
   - **Minor** (1.2.11 → 1.3.0): New features, backwards compatible
   - **Major** (1.3.0 → 2.0.0): Breaking changes

2. **Update version in ALL THREE files** (they must match):
   - `apps/inboxhunter-app/package.json` - `"version": "X.Y.Z"`
   - `apps/inboxhunter-app/src-tauri/tauri.conf.json` - `"version": "X.Y.Z"`
   - `apps/inboxhunter-app/src-tauri/Cargo.toml` - `version = "X.Y.Z"`

3. **Stage and commit all changes**:
   ```bash
   git add -A
   git commit -m "feat: <description of changes>\n\nCo-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
   ```

4. **Create the version tag**:
   ```bash
   git tag vX.Y.Z
   ```

5. **Push to origin with tags**:
   ```bash
   git push origin main --tags
   ```

## What Happens After Push

The CI/CD pipeline automatically:
1. **check-version** job verifies the version doesn't already exist
2. **build** jobs run in parallel for Windows (.msi, .exe) and Linux (.deb, .AppImage)
3. **publish-public** job copies release assets to the public repo (polajenko/inbox-hunter)

The entire process takes ~20-25 minutes.

## Checking Current Version

To find the current version before bumping:
```bash
git tag -l "v*" | sort -V | tail -1
```

Or check any of the three config files.

## Troubleshooting

### "Release already exists" error
Use a new version number. Check existing tags first.

### Build failed mid-way
Delete the tag and try again:
```bash
git tag -d vX.Y.Z
git push --delete origin vX.Y.Z
# Fix the issue, then release again
```

### Version mismatch
All three config files must have the same version. Always update all three.

## Guidelines

- Always check `git status` before releasing to see what changes will be included
- Use descriptive commit messages that summarize all changes in the release
- Include the Co-Authored-By line in commits
- Never force push to main
- Wait for CI/CD to complete before announcing the release
