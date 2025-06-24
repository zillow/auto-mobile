#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const GITHUB_REPO = 'https://github.com/zillow/auto-mobile/blob/main';
const GITHUB_RAW = 'https://github.com/zillow/auto-mobile/raw/main';

function transformReadme() {
  const readmePath = path.join(__dirname, '../..', 'README.md');

  if (!fs.existsSync(readmePath)) {
    console.error('README.md not found');
    process.exit(1);
  }

  let content = fs.readFileSync(readmePath, 'utf8');

  // Transform relative links to absolute GitHub URLs
  // Match markdown links: [text](relative/path) but not absolute URLs and not images
  content = content.replace(/(?<!!)\[([^\]]+)\]\(([^)]+)\)/g, (match, linkText, linkPath) => {
    // Skip if already absolute URL (contains protocol)
    if (linkPath.startsWith('http://') || linkPath.startsWith('https://') || linkPath.startsWith('//')) {
      return match;
    }

    // Skip if it's an anchor link
    if (linkPath.startsWith('#')) {
      return match;
    }

    // Convert relative path to absolute GitHub URL
    // If path doesn't start with a slash, add one
    const cleanPath = linkPath.startsWith('/') ? linkPath.substring(1) : linkPath;
    const absoluteUrl = `${GITHUB_REPO}/${cleanPath}`;
    return `[${linkText}](${absoluteUrl})`;
  });

  // Transform image references: ![alt](relative/path) - use raw URLs for images
  content = content.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (match, altText, imagePath) => {
    // Skip if already absolute URL (contains protocol)
    if (imagePath.startsWith('http://') || imagePath.startsWith('https://') || imagePath.startsWith('//')) {
      return match;
    }

    // Convert relative path to absolute GitHub raw URL for images
    // If path doesn't start with a slash, add one
    const cleanPath = imagePath.startsWith('/') ? imagePath.substring(1) : imagePath;
    const absoluteUrl = `${GITHUB_RAW}/${cleanPath}`;
    return `![${altText}](${absoluteUrl})`;
  });

  // Write the transformed content back
  fs.writeFileSync(readmePath, content, 'utf8');
  console.log('✅ README.md transformed for publishing');
}

if (require.main === module) {
  transformReadme();
}

module.exports = transformReadme;
