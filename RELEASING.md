# Releasing InboxHunter

This document explains how to release new versions of InboxHunter.

## Quick Release (Recommended)

Use the version helper script:

```bash
# 1. Check current version and see suggestions
./scripts/version.sh

# 2. Create a release (bumps version, commits, and tags)
./scripts/version.sh release 1.2.11

# 3. Push to trigger the build
git push origin main --tags
```

That's it! The CI/CD pipeline will automatically:
- Build Windows (.msi, .exe) and Linux (.deb, .AppImage) installers
- Create a draft release on the private repo
- Publish to the public repo (polajenko/inbox-hunter) for auto-updates

## Manual Release

If you prefer to do it manually:

### 1. Update Version Numbers

Update the version in **all three files** (they must match):

- `apps/inboxhunter-app/src-tauri/tauri.conf.json`
  ```json
  "package": {
    "productName": "InboxHunter",
    "version": "1.2.11"
  }
  ```

- `apps/inboxhunter-app/package.json`
  ```json
  "version": "1.2.11"
  ```

- `apps/inboxhunter-app/src-tauri/Cargo.toml`
  ```toml
  version = "1.2.11"
  ```

### 2. Commit the Version Bump

```bash
git add apps/inboxhunter-app/src-tauri/tauri.conf.json \
        apps/inboxhunter-app/package.json \
        apps/inboxhunter-app/src-tauri/Cargo.toml

git commit -m "chore: Bump version to 1.2.11"
```

### 3. Create and Push the Tag

```bash
git tag v1.2.11
git push origin main --tags
```

## Versioning Guidelines

We use [Semantic Versioning](https://semver.org/):

- **Patch** (1.2.10 → 1.2.11): Bug fixes, minor improvements
- **Minor** (1.2.11 → 1.3.0): New features, backwards compatible
- **Major** (1.3.0 → 2.0.0): Breaking changes

## Checking Existing Versions

```bash
# List all version tags
git tag -l "v*" | sort -V

# Check the latest tag
git tag -l "v*" | sort -V | tail -1

# Use the helper script
./scripts/version.sh
```

## What Happens After Push

1. **check-version** job verifies the version doesn't already exist
2. **build** jobs run in parallel for Windows and Linux
3. **publish-public** job copies release assets to the public repo

The entire process takes ~20-25 minutes.

## Troubleshooting

### "Release already exists" error

You tried to release a version that's already published. Use a new version number:

```bash
./scripts/version.sh  # See suggested next version
```

### Build failed mid-way

Draft releases can be retried. Delete the tag and try again:

```bash
git tag -d v1.2.11
git push --delete origin v1.2.11
# Fix the issue, then release again
./scripts/version.sh release 1.2.11
git push origin main --tags
```

### Version mismatch

All three config files must have the same version. The helper script handles this automatically, but if you're doing it manually, double-check all files.

## Release Artifacts

Each release includes:

| Platform | Files |
|----------|-------|
| Windows | `.msi` installer, `.exe` (NSIS), `.msi.zip` (signed update) |
| Linux | `.deb` package, `.AppImage`, `.AppImage.tar.gz` (signed update) |
| Both | `latest.json` (auto-updater manifest) |

## Auto-Updates

Users with InboxHunter installed will automatically receive updates from:
https://github.com/polajenko/inbox-hunter/releases

The app checks for updates on startup and notifies users when a new version is available.
