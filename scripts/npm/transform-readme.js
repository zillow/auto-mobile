#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const GITHUB_REPO = 'https://github.com/zillow/auto-mobile/blob/main';

function transformReadme() {
    const readmePath = path.join(__dirname, '../../', 'README.md');

    if (!fs.existsSync(readmePath)) {
        console.error('README.md not found');
        process.exit(1);
    }

    let content = fs.readFileSync(readmePath, 'utf8');

    // Transform relative links to absolute GitHub URLs
    // Match markdown links: [text](relative/path)
    content = content.replace(/\[([^\]]+)\]\((?!https?:\/\/)([^)]+)\)/g, (match, linkText, relativePath) => {
        // Skip if already absolute URL
        if (relativePath.startsWith('http://') || relativePath.startsWith('https://')) {
            console.log('nothing changed');
            return match;
        }

        // Convert relative path to absolute GitHub URL
        const absoluteUrl = `${GITHUB_REPO}/${relativePath}`;
        console.log('abs path set!');
        return `[${linkText}](${absoluteUrl})`;
    });

    // Transform image references: ![alt](relative/path)
    content = content.replace(/!\[([^\]]*)\]\((?!https?:\/\/)([^)]+)\)/g, (match, altText, relativePath) => {
        // Skip if already absolute URL
        if (relativePath.startsWith('http://') || relativePath.startsWith('https://')) {
            console.log('nothing changed');
            return match;
        }

        // Convert relative path to absolute GitHub URL
        const absoluteUrl = `${GITHUB_REPO}/${relativePath}`;
        console.log('abs path set!');
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
