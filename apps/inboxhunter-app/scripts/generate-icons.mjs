#!/usr/bin/env node
/**
 * Generate Tauri app icons from source image
 * Uses sharp for image processing
 */

import sharp from 'sharp';
import { mkdir, rm, writeFile } from 'fs/promises';
import { existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, '..');

const SOURCE_ICON = join(projectRoot, 'public', 'InboxHunter-logo-icon.png');
const ICONS_DIR = join(projectRoot, 'src-tauri', 'icons');

// Required icon sizes for Tauri
const PNG_SIZES = [
  { name: '32x32.png', size: 32 },
  { name: '128x128.png', size: 128 },
  { name: '128x128@2x.png', size: 256 },
  { name: 'icon.png', size: 512 },  // Base icon
];

// Sizes needed for ICO file (Windows)
const ICO_SIZES = [16, 24, 32, 48, 64, 128, 256];

// Sizes needed for ICNS file (macOS)
const ICNS_SIZES = [16, 32, 64, 128, 256, 512, 1024];

async function generatePNGs() {
  console.log('📦 Generating PNG icons...');
  
  for (const { name, size } of PNG_SIZES) {
    const outputPath = join(ICONS_DIR, name);
    await sharp(SOURCE_ICON)
      .resize(size, size, {
        fit: 'contain',
        background: { r: 0, g: 0, b: 0, alpha: 0 }
      })
      .png()
      .toFile(outputPath);
    console.log(`  ✅ ${name} (${size}x${size})`);
  }
}

async function generateICO() {
  console.log('📦 Generating Windows ICO...');
  
  // Generate individual PNGs for ICO
  const icoImages = [];
  for (const size of ICO_SIZES) {
    const buffer = await sharp(SOURCE_ICON)
      .resize(size, size, {
        fit: 'contain',
        background: { r: 0, g: 0, b: 0, alpha: 0 }
      })
      .png()
      .toBuffer();
    icoImages.push({ size, buffer });
  }
  
  // Create ICO file manually (ICO format)
  const icoBuffer = createICO(icoImages);
  await writeFile(join(ICONS_DIR, 'icon.ico'), icoBuffer);
  console.log('  ✅ icon.ico');
}

function createICO(images) {
  // ICO file format:
  // - 6 byte header
  // - 16 byte entry for each image
  // - PNG data for each image
  
  const headerSize = 6;
  const entrySize = 16;
  const numImages = images.length;
  
  // Calculate offsets
  let offset = headerSize + (entrySize * numImages);
  const entries = images.map(({ size, buffer }) => {
    const entry = {
      width: size >= 256 ? 0 : size,
      height: size >= 256 ? 0 : size,
      offset,
      size: buffer.length,
      buffer
    };
    offset += buffer.length;
    return entry;
  });
  
  // Create buffer
  const totalSize = offset;
  const ico = Buffer.alloc(totalSize);
  
  // Write header
  ico.writeUInt16LE(0, 0);        // Reserved
  ico.writeUInt16LE(1, 2);        // Type: 1 = ICO
  ico.writeUInt16LE(numImages, 4); // Number of images
  
  // Write entries
  let entryOffset = headerSize;
  for (const entry of entries) {
    ico.writeUInt8(entry.width, entryOffset);
    ico.writeUInt8(entry.height, entryOffset + 1);
    ico.writeUInt8(0, entryOffset + 2);  // Color palette
    ico.writeUInt8(0, entryOffset + 3);  // Reserved
    ico.writeUInt16LE(1, entryOffset + 4);  // Color planes
    ico.writeUInt16LE(32, entryOffset + 6); // Bits per pixel
    ico.writeUInt32LE(entry.size, entryOffset + 8);
    ico.writeUInt32LE(entry.offset, entryOffset + 12);
    entryOffset += entrySize;
  }
  
  // Write image data
  for (const entry of entries) {
    entry.buffer.copy(ico, entry.offset);
  }
  
  return ico;
}

async function generateICNS() {
  console.log('📦 Generating macOS ICNS...');
  
  // Create temporary iconset directory
  const iconsetDir = join(ICONS_DIR, 'icon.iconset');
  
  if (existsSync(iconsetDir)) {
    await rm(iconsetDir, { recursive: true });
  }
  await mkdir(iconsetDir, { recursive: true });
  
  // Generate all required sizes for iconset
  const iconsetSizes = [
    { name: 'icon_16x16.png', size: 16 },
    { name: 'icon_16x16@2x.png', size: 32 },
    { name: 'icon_32x32.png', size: 32 },
    { name: 'icon_32x32@2x.png', size: 64 },
    { name: 'icon_128x128.png', size: 128 },
    { name: 'icon_128x128@2x.png', size: 256 },
    { name: 'icon_256x256.png', size: 256 },
    { name: 'icon_256x256@2x.png', size: 512 },
    { name: 'icon_512x512.png', size: 512 },
    { name: 'icon_512x512@2x.png', size: 1024 },
  ];
  
  for (const { name, size } of iconsetSizes) {
    await sharp(SOURCE_ICON)
      .resize(size, size, {
        fit: 'contain',
        background: { r: 0, g: 0, b: 0, alpha: 0 }
      })
      .png()
      .toFile(join(iconsetDir, name));
  }
  
  // Use iconutil to create .icns (macOS only)
  try {
    execSync(`iconutil -c icns "${iconsetDir}" -o "${join(ICONS_DIR, 'icon.icns')}"`, {
      stdio: 'pipe'
    });
    console.log('  ✅ icon.icns');
  } catch (error) {
    console.log('  ⚠️  iconutil not available (not on macOS), skipping .icns');
    // Create a placeholder or copy the largest PNG
    await sharp(SOURCE_ICON)
      .resize(512, 512)
      .png()
      .toFile(join(ICONS_DIR, 'icon.icns'));
  }
  
  // Cleanup iconset directory
  await rm(iconsetDir, { recursive: true });
}

async function main() {
  console.log('\n🎨 InboxHunter Icon Generator\n');
  console.log(`Source: ${SOURCE_ICON}`);
  console.log(`Output: ${ICONS_DIR}\n`);
  
  // Ensure icons directory exists
  await mkdir(ICONS_DIR, { recursive: true });
  
  try {
    await generatePNGs();
    await generateICO();
    await generateICNS();
    
    console.log('\n✅ All icons generated successfully!\n');
  } catch (error) {
    console.error('\n❌ Error generating icons:', error.message);
    process.exit(1);
  }
}

main();

