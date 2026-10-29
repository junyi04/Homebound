import {test, expect} from '@playwright/test';

test('start fills viewport; resize and Escape preserve the paused run', async ({page}) => {
  await page.setViewportSize({width:1366,height:768});
  await page.goto('/');
  await page.locator('#start').click();
  await expect(page.locator('#welcome')).toBeHidden();
  await expect(page.locator('#game-shell')).toHaveClass(/is-focused/);
  let bounds = await page.locator('#game-shell').boundingBox();
  expect(bounds).toEqual({x:0,y:0,width:1366,height:768});
  await page.keyboard.press('ArrowUp');
  await expect(page.locator('#distance')).toContainText('1');
  await page.screenshot({path:'images/homebound-focused.png'});
  await page.setViewportSize({width:1280,height:720});
  bounds = await page.locator('#game-shell').boundingBox();
  expect(bounds).toEqual({x:0,y:0,width:1280,height:720});
  await page.keyboard.press('Escape');
  await expect(page.locator('#game-shell')).not.toHaveClass(/is-focused/);
  await expect(page.locator('#paused')).toBeVisible();
  await expect(page.locator('#distance')).toContainText('1');
  expect(await page.locator('footer').evaluate(el=>el.inert)).toBe(false);
  await page.locator('#resume').click();
  await expect(page.locator('#game-shell')).toHaveClass(/is-focused/);
  await expect(page.locator('#paused')).toBeHidden();
});

test('native fullscreen can be entered and exited without losing the run', async ({page}) => {
  await page.goto('/');
  await page.locator('#start').click();
  await expect(page.locator('#welcome')).toBeHidden();
  await page.locator('#fullscreen').click();
  await expect.poll(()=>page.evaluate(()=>document.fullscreenElement?.id)).toBe('game-shell');
  await expect(page.locator('#fullscreen')).toHaveAttribute('aria-pressed','true');
  await page.locator('#fullscreen').click();
  await expect.poll(()=>page.evaluate(()=>document.fullscreenElement)).toBeNull();
  await expect(page.locator('#game-shell')).not.toHaveClass(/is-focused/);
  await expect(page.locator('#paused')).toBeVisible();
});

test('fullscreen rejection leaves a playable viewport-sized game', async ({page}) => {
  await page.addInitScript(()=>{Element.prototype.requestFullscreen=()=>Promise.reject(new Error('denied'));});
  await page.goto('/');
  await page.locator('#start').click();
  await expect(page.locator('#welcome')).toBeHidden();
  await page.locator('#fullscreen').click();
  await expect(page.locator('#effect')).toContainText('전체화면을 열 수 없어요');
  await expect(page.locator('#game-shell')).toHaveClass(/is-focused/);
  await page.locator('#game').focus();
  await page.keyboard.press('ArrowUp');
  await expect(page.locator('#distance')).toContainText('1');
});

test('failed start returns to the lobby with an actionable error', async ({page}) => {
  await page.route('**/api/runs',route=>route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'테스트 연결 오류'})}));
  await page.goto('/');
  await page.locator('#start').click();
  await expect(page.locator('#start-error')).toContainText('테스트 연결 오류');
  await expect(page.locator('#game-shell')).not.toHaveClass(/is-focused/);
  await expect(page.locator('#start')).toBeEnabled();
  await expect(page.locator('#endless')).toBeEnabled();
});
