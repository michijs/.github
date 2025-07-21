const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();

  // Emulate print media
  await page.emulateMedia({ media: 'print' });

  // Go to your hosted/local page (use Vercel/Netlify preview or local server)
  await page.goto('https://your-site.com/your-page');

  await page.screenshot({ path: 'print-screenshot.png', fullPage: true });

  await browser.close();
})();
