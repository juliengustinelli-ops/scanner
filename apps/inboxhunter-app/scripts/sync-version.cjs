#!/usr/bin/env node
/**
 * Sync version from package.json to tauri.conf.json and Cargo.toml
 *
 * Usage: node scripts/sync-version.js [new-version]
 *
 * If new-version is provided, updates package.json first, then syncs.
 * If no argument, just syncs from current package.json version.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const PACKAGE_JSON = path.join(ROOT, 'package.json');
const TAURI_CONF = path.join(ROOT, 'src-tauri', 'tauri.conf.json');
const CARGO_TOML = path.join(ROOT, 'src-tauri', 'Cargo.toml');

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeJson(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n');
}

function updateCargoToml(filePath, newVersion) {
  let content = fs.readFileSync(filePath, 'utf8');
  // Match version = "x.y.z" in the [package] section (first occurrence)
  content = content.replace(
    /^(version\s*=\s*")[^"]+(")/m,
    `$1${newVersion}$2`
  );
  fs.writeFileSync(filePath, content);
}

function main() {
  const newVersion = process.argv[2];

  // Read current package.json
  const pkg = readJson(PACKAGE_JSON);

  // If new version provided, update package.json first
  if (newVersion) {
    // Validate semver format
    if (!/^\d+\.\d+\.\d+(-[\w.]+)?$/.test(newVersion)) {
      console.error(`Invalid version format: ${newVersion}`);
      console.error('Expected format: X.Y.Z or X.Y.Z-prerelease');
      process.exit(1);
    }
    pkg.version = newVersion;
    writeJson(PACKAGE_JSON, pkg);
    console.log(`✓ Updated package.json to ${newVersion}`);
  }

  const version = pkg.version;
  console.log(`Syncing version ${version} to all config files...`);

  // Update tauri.conf.json
  const tauriConf = readJson(TAURI_CONF);
  const oldTauriVersion = tauriConf.package.version;
  tauriConf.package.version = version;
  writeJson(TAURI_CONF, tauriConf);
  console.log(`✓ Updated tauri.conf.json: ${oldTauriVersion} → ${version}`);

  // Update Cargo.toml
  const cargoContent = fs.readFileSync(CARGO_TOML, 'utf8');
  const oldCargoVersion = cargoContent.match(/^version\s*=\s*"([^"]+)"/m)?.[1];
  updateCargoToml(CARGO_TOML, version);
  console.log(`✓ Updated Cargo.toml: ${oldCargoVersion} → ${version}`);

  console.log(`\nAll files synced to version ${version}`);
}

main();
