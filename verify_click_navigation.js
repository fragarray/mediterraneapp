const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto('http://localhost:8000/sito/index.html', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(3000);
  await page.locator('#carouselTrack img').first().click();
  await page.waitForTimeout(500);
  const btn = page.locator('#lightboxBookingBtn');
  await btn.click();
  await page.waitForTimeout(1000);
  console.log(JSON.stringify({
    finalUrl: page.url(),
    isHidden: await btn.evaluate(el => el.hidden),
    lightboxActive: await page.locator('#lightbox').evaluate(el => el.classList.contains('active'))
  }, null, 2));
  await browser.close();
})();
