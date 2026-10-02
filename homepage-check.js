const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto('http://localhost:8000/sito/index.html', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(2500);

  const bodyText = await page.locator('body').innerText();
  const lightboxBtn = await page.locator('#lightboxBookingBtn').count();
  const carouselSlides = await page.locator('.carousel-slide').count();
  const hasPrenotaOra = bodyText.toLowerCase().includes('prenota ora');

  console.log(JSON.stringify({
    hasPrenotaOra,
    lightboxBtn,
    carouselSlides,
    bodySnippet: bodyText.slice(0, 500),
  }, null, 2));

  await browser.close();
})();
