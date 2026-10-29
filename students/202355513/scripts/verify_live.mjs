import {chromium} from '@playwright/test';
import {writeFile} from 'node:fs/promises';
const url=process.argv[2];
if(!url?.startsWith('https://'))throw new Error('Pass the deployed HTTPS Route URL');
const browser=await chromium.launch({channel:'chrome',headless:true});
try{
  const page=await browser.newPage({viewport:{width:1440,height:1200}});
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  const response=await page.goto(url);
  if(response.status()!==200)throw new Error(`Unexpected response ${response.status()}`);
  await page.locator('#start').click();
  await page.locator('#welcome').waitFor({state:'hidden'});
  await page.keyboard.press('ArrowUp');
  await page.waitForTimeout(220);
  await page.keyboard.press('ArrowUp');
  await page.waitForTimeout(250);
  const distance=await page.locator('#distance').innerText();
  if(!distance.includes('2'))throw new Error(`Movement failed: ${distance}`);
  await page.screenshot({path:'images/homebound-openshift.png',fullPage:true});
  await page.keyboard.press('p');
  await page.locator('#paused').waitFor({state:'visible'});
  await page.keyboard.press('p');
  await page.locator('#paused').waitFor({state:'hidden'});
  if(errors.length)throw new Error(errors.join('\n'));
  await writeFile('evidence/live-browser.json',JSON.stringify({verified_at:new Date().toISOString(),url,http_status:response.status(),movement:distance,keyboard_pause_resume:'passed',page_errors:errors},null,2)+'\n');
  console.log('PASS: deployed HTTPS game renders, moves and pauses in Chrome.');
}finally{await browser.close();}
