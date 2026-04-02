const fs = require('fs');
const path = require('path');

// Simple PNG generator without external dependencies
// Creates a basic colored square with "R" text indicator

const sizes = [72, 96, 128, 144, 152, 192, 384, 512];
const iconsDir = path.join(__dirname, '../public/icons');

// Ensure icons directory exists
if (!fs.existsSync(iconsDir)) {
  fs.mkdirSync(iconsDir, { recursive: true });
}

// Try to use sharp if available, otherwise create SVG placeholders
async function generateIcons() {
  let sharp;
  try {
    sharp = require('sharp');
    console.log('Using sharp for icon generation...');

    for (const size of sizes) {
      const svg = `
        <svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <linearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" style="stop-color:#C74634"/>
              <stop offset="100%" style="stop-color:#A33B2C"/>
            </linearGradient>
          </defs>
          <rect width="${size}" height="${size}" rx="${size * 0.15}" fill="url(#grad)"/>
          <text x="${size/2}" y="${size * 0.65}"
                font-family="Arial, sans-serif"
                font-size="${size * 0.55}"
                font-weight="bold"
                fill="white"
                text-anchor="middle">R</text>
        </svg>
      `;

      await sharp(Buffer.from(svg))
        .png()
        .toFile(path.join(iconsDir, `icon-${size}.png`));

      console.log(`Created icon-${size}.png`);
    }
    console.log('\nAll icons generated successfully!');

  } catch (e) {
    if (e.code === 'MODULE_NOT_FOUND') {
      console.log('Sharp not installed. Creating SVG icons instead...');
      console.log('For PNG icons, run: npm install sharp -D\n');

      // Create SVG icons as fallback
      for (const size of sizes) {
        const svg = `<svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#C74634"/>
      <stop offset="100%" style="stop-color:#A33B2C"/>
    </linearGradient>
  </defs>
  <rect width="${size}" height="${size}" rx="${size * 0.15}" fill="url(#grad)"/>
  <text x="${size/2}" y="${size * 0.65}" font-family="Arial, sans-serif" font-size="${size * 0.55}" font-weight="bold" fill="white" text-anchor="middle">R</text>
</svg>`;

        fs.writeFileSync(path.join(iconsDir, `icon-${size}.svg`), svg);
        console.log(`Created icon-${size}.svg`);
      }

      console.log('\nSVG icons created. For PNG icons:');
      console.log('1. Run: npm install sharp -D');
      console.log('2. Run this script again: node scripts/generate-pwa-icons.js');
      console.log('\nOr open scripts/generate-icons.html in a browser to download PNGs manually.');
    } else {
      throw e;
    }
  }
}

generateIcons();
