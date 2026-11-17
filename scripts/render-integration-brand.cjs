// Render the existing Butler artwork as Home Assistant's local brand assets.
// Run: node scripts/render-integration-brand.cjs (card Playwright dependency required).
const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');

const root = path.resolve(__dirname, '..');
const requireCard = createRequire(path.join(root, 'apps/dashboard-card/package.json'));
const { chromium } = requireCard('playwright');

(async () => {
  const source = fs.readFileSync(path.join(root, 'apps/configuration-app/web/assets/logo.svg'), 'utf8');
  const target = path.join(root, 'custom_components/backend_butler/brand');
  fs.mkdirSync(target, { recursive: true });
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  try {
    const page = await browser.newPage();
    for (const [theme, jacket] of [['', '#020202'], ['dark_', '#f2f2f2']]) {
      for (const size of [256, 512]) {
        const png = await page.evaluate(async ({ source, jacket, size }) => {
          const svg = new DOMParser().parseFromString(source, 'image/svg+xml').documentElement;
          document.body.append(svg);
          const bounds = svg.getBBox();
          const side = Math.max(bounds.width, bounds.height);
          svg.setAttribute('viewBox', `${bounds.x + (bounds.width - side) / 2} ${bounds.y + (bounds.height - side) / 2} ${side} ${side}`);
          svg.setAttribute('width', size);
          svg.setAttribute('height', size);
          for (const shape of svg.querySelectorAll('[fill="#020202"]')) shape.setAttribute('fill', jacket);
          const image = new Image();
          image.src = 'data:image/svg+xml;base64,' + btoa(new XMLSerializer().serializeToString(svg));
          await image.decode();
          const canvas = document.createElement('canvas');
          canvas.width = canvas.height = size;
          canvas.getContext('2d').drawImage(image, 0, 0, size, size);
          svg.remove();
          return canvas.toDataURL('image/png').split(',')[1];
        }, { source, jacket, size });
        fs.writeFileSync(path.join(target, `${theme}icon${size === 512 ? '@2x' : ''}.png`), Buffer.from(png, 'base64'));
      }
    }
  } finally {
    await browser.close();
  }
  console.log('Rendered Butler integration icons for light/dark themes at 256 and 512 pixels.');
})().catch(error => { console.error(error); process.exitCode = 1; });
