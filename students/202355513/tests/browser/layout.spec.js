import {test, expect} from '@playwright/test';

for (const [width, height] of [[1920,1080], [1440,900], [1366,768], [1280,720], [1024,600], [1280,560]]) {
  test(`lobby fits ${width}x${height} without page scrolling`, async ({page}) => {
    await page.setViewportSize({width,height});
    if (height === 560) await page.route('**/api/leaderboard?*', route => route.fulfill({contentType:'application/json',body:JSON.stringify({day:'2026-10-30',entries:Array.from({length:10},(_,i)=>({name:`귀가왕${i+1}`,score:1000-i*10}))})}));
    await page.goto('/');
    await expect(page.locator('#start')).toBeVisible();
    const sizes = await page.evaluate(() => ({
      width: document.documentElement.scrollWidth, height: document.documentElement.scrollHeight,
      game: document.querySelector('#playfield').getBoundingClientRect().toJSON(),
      start: document.querySelector('#start').getBoundingClientRect().toJSON(),
      footer: document.querySelector('footer').getBoundingClientRect().toJSON()
    }));
    expect(sizes.width).toBeLessThanOrEqual(width);
    expect(sizes.height).toBeLessThanOrEqual(height);
    expect(sizes.game.height).toBeGreaterThan(250);
    expect(sizes.start.bottom).toBeLessThan(height);
    expect(sizes.footer.bottom).toBeLessThanOrEqual(height);
    if (width === 1366) await page.screenshot({path:'images/homebound-laptop.png'});
  });
}
