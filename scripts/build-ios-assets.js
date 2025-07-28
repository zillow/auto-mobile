#!/usr/bin/env node

const fs = require('fs-extra');
const path = require('path');

async function copyIOSAssets() {
  const sourceWDADir = path.join(__dirname, '..', 'ios', 'WebDriverAgent');
  const destWDADir = path.join(__dirname, '..', 'dist', 'ios', 'WebDriverAgent');

  try {
    console.log('Copying WebDriverAgent project to dist directory...');

    // Ensure the destination directory exists
    await fs.ensureDir(path.dirname(destWDADir));

    // Copy the entire WebDriverAgent directory
    await fs.copy(sourceWDADir, destWDADir, {
      filter: (src) => {
        // Skip node_modules and other unnecessary directories
        return !src.includes('node_modules') &&
          !src.includes('.git') &&
          !src.includes('scratch');
      }
    });

    console.log('WebDriverAgent project copied successfully to dist/ios/WebDriverAgent');
  } catch (error) {
    console.error('Failed to copy WebDriverAgent project:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  copyIOSAssets();
}

module.exports = {copyIOSAssets};
