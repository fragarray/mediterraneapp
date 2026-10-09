const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  page.on('console', msg => console.log('BROWSER_CONSOLE:', msg.type(), msg.text()));
  page.on('pageerror', err => console.log('PAGE_ERROR:', err.toString()));
  page.on('requestfailed', req => {
    const failure = req.failure();
    console.log('REQUEST_FAILED:', req.url(), failure && failure.errorText);
  });

  await page.goto('http://localhost:8000/sito/admin-shell.html?view=eventi', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(2000);

  const title = await page.title();
  const shellText = await page.locator('body').innerText();
  const frames = page.frames();
  const frame = frames.find(f => /admin-eventi\.html/.test(f.url()));

  const info = {
    title,
    hasFrame: !!frame,
    bodySnippet: shellText.slice(0, 400),
    frameReady: frame ? (await frame.locator('body').innerText()).slice(0, 300) : 'NO-FRAME',
    shellHtml: await page.locator('#adminFrame').evaluate(el => ({
      src: el.src,
      display: getComputedStyle(el).display,
      width: el.offsetWidth,
      height: el.offsetHeight,
    })),
  };

  console.log(JSON.stringify(info, null, 2));
  await browser.close();
})();
