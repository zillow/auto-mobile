#!/usr/bin/env node

const fs = require('fs-extra');
const path = require('path');

async function copyIOSAssets() {
  const sourceXCTestDir = path.join(__dirname, '..', 'ios', 'XCTestService');
  const destXCTestDir = path.join(__dirname, '..', 'dist', 'ios', 'XCTestService');

  try {
    console.log('Copying XCTestService project to dist directory...');

    // Ensure the destination directory exists
    await fs.ensureDir(path.dirname(destXCTestDir));

    // Copy the entire XCTestService directory
    await fs.copy(sourceXCTestDir, destXCTestDir, {
      filter: (src) => {
        // Skip node_modules and other unnecessary directories
        return !src.includes('node_modules') &&
          !src.includes('.git') &&
          !src.includes('scratch') &&
          !src.includes('.build') &&
          !src.includes('DerivedData');
      }
    });

    console.log('XCTestService project copied successfully to dist/ios/XCTestService');
  } catch (error) {
    console.error('Failed to copy XCTestService project:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  // TODO: Enable once we resume iOS development
  // copyIOSAssets();
}

module.exports = {copyIOSAssets};
