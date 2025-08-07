const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();

  // Emulate print media
  await page.emulateMedia({ media: 'screen' });

  // Go to your hosted/local page (use Vercel/Netlify preview or local server)
  await page.goto(process.env.TARGET_URL);

  await page.screenshot({ path: 'screenshots/print-screenshot.png', fullPage: true });

  await browser.close();
})();
