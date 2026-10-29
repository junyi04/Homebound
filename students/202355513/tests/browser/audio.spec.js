import {test, expect} from '@playwright/test';

test('audio defaults on, starts after a gesture, and stops on mute and pause', async ({page}) => {
  await page.addInitScript(() => {
    const Native = window.AudioContext;
    window.audioStats = {contexts: [], started: 0};
    window.AudioContext = class extends Native {
      constructor(...args) { super(...args); window.audioStats.contexts.push(this); }
      createOscillator() {
        const node = super.createOscillator(), start = node.start.bind(node);
        node.start = (...args) => { window.audioStats.started++; return start(...args); };
        return node;
      }
    };
  });
  await page.goto('/');
  await expect(page.locator('header')).toHaveCount(0);
  await expect(page.locator('#sound')).toHaveAttribute('aria-pressed','true');
  expect(await page.evaluate(()=>window.audioStats.contexts.length)).toBe(0);
  await page.locator('#start').click();
  await expect(page.locator('#welcome')).toBeHidden();
  await expect.poll(()=>page.evaluate(()=>window.audioStats.contexts[0]?.state)).toBe('running');
  await expect.poll(()=>page.evaluate(()=>window.audioStats.started)).toBeGreaterThan(5);
  await page.locator('#sound').click();
  await expect(page.locator('#sound')).toHaveAttribute('aria-pressed','false');
  const muted = await page.evaluate(()=>window.audioStats.started);
  await page.locator('#game').focus();
  await page.keyboard.press('ArrowUp');
  await page.waitForTimeout(400);
  expect(await page.evaluate(()=>window.audioStats.started)).toBe(muted);
  await page.locator('#sound').click();
  await expect.poll(()=>page.evaluate(()=>window.audioStats.started)).toBeGreaterThan(muted);
  await page.locator('#pause').click();
  const paused = await page.evaluate(()=>window.audioStats.started);
  await page.waitForTimeout(400);
  expect(await page.evaluate(()=>window.audioStats.started)).toBe(paused);
  await page.locator('#resume').click();
  await expect.poll(()=>page.evaluate(()=>window.audioStats.started)).toBeGreaterThan(paused);
});
