// Isolated real settings form and production CSS; no server action or email runs.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const require = createRequire(import.meta.url);
const { build } = require(process.env.ESBUILD_MODULE || 'esbuild');
const playwright = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = fileURLToPath(new URL('../', import.meta.url));
const css = await readFile(path.join(root, 'src/styles/globals.css'), 'utf8');
const result = await build({ absWorkingDir: root, bundle: true, write: false, format: 'iife', jsx: 'automatic', define: { 'process.env.NODE_ENV': '"development"' },
  stdin: { resolveDir: root, loader: 'tsx', contents: `import React from 'react';import {createRoot} from 'react-dom/client';import {NotificationPreferencesForm} from './src/components/notification-preferences-form';
  createRoot(document.getElementById('root')).render(<main className="shell app-content settings-page"><h1>Notification settings</h1><NotificationPreferencesForm recipientEmail="a-very-long-manager-sign-in-address@angeltreeservice.example.test" preferences={{daily_summary_email_enabled:false,handoff_email_enabled:false,daily_summary_hour:7,quote_email_enabled:true,payment_email_enabled:true,change_order_email_enabled:true,customer_update_email_enabled:true,file_email_enabled:true,message_email_enabled:true}}/><section className="detail-panel"><h2>Recent manager emails</h2><article className="next-action-item"><strong>Morning operations summary</strong><p>Accepted by email provider · Sep 8, 2026, 7:00 AM</p><small>Automatic retries stopped to avoid a duplicate. Review delivery history before taking further action.</small></article></section></main>);` },
  plugins: [{ name: 'mock-action', setup(b) {
    b.onResolve({ filter: /^@\/lib\/actions\/notifications$/ }, a => ({ path: a.path, namespace: 'mock' }));
    b.onLoad({ filter: /.*/, namespace: 'mock' }, () => ({ loader: 'js', contents: `export async function updateNotificationPreferences(_s,data){window.calls=(window.calls||0)+1;window.sent=[...data.entries()];await new Promise(r=>setTimeout(r,250));return window.calls===1?{status:'error',message:'Preferences could not be saved. Your selections are still here; please retry.'}:{status:'success',message:'Notification preferences saved.'};}` }));
  } }],
});
const artifacts = path.join(root, '../../output/playwright/manager-notifications'); await mkdir(artifacts, { recursive: true });
for (const engine of ['chromium','firefox','webkit']) {
  const browser = await playwright[engine].launch({ headless: true });
  try {
    for (const [width,height] of [[320,700],[390,844],[844,390],[768,1024],[1440,900]]) {
      const page = await browser.newPage({ viewport: { width,height } }); const errors=[];
      page.on('pageerror', e => errors.push(e.message));
      await page.route('**/*', route => route.request().url() === 'http://localhost:54399/' ? route.fulfill({ contentType:'text/html',body:'<!doctype html><meta name="viewport" content="width=device-width, initial-scale=1"><div id="root"></div>' }) : route.abort());
      await page.goto('http://localhost:54399/'); await page.addStyleTag({content:css}); await page.addScriptTag({content:result.outputFiles[0].text});
      const morning=page.getByRole('checkbox',{name:/Morning operations summary/});
      const handoff=page.getByRole('checkbox',{name:/Assigned handoff emails/});
      assert.equal(await morning.isChecked(),false); assert.equal(await handoff.isChecked(),false);
      await morning.check(); await handoff.check(); await page.getByLabel('Summary time (Eastern)').selectOption('9');
      await page.getByRole('button',{name:'Save preferences'}).click();
      await page.getByRole('alert').waitFor();
      assert.equal(await morning.isChecked(),true); assert.equal(await handoff.isChecked(),true);
      assert.equal(await page.getByLabel('Summary time (Eastern)').inputValue(),'9');
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
      for(const target of ['.notification-preference-row','select','button[type=submit]']) assert.ok((await page.locator(target).first().boundingBox()).height>=44);
      await page.screenshot({path:path.join(artifacts,`${engine}-${width}-${height}.png`),fullPage:true});
      await page.getByRole('button',{name:'Save preferences'}).click(); await page.getByRole('status').waitFor();
      assert.equal(await page.evaluate(()=>window.calls),2);
      assert.equal(await page.evaluate(()=>window.sent.find(([key])=>key==='quote_email_enabled')[1]),'1');
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
      assert.deepEqual(errors,[]);
      console.log(`PASS ${engine} ${width}x${height}: safe wrapping, touch targets, retained retry, saved feedback`);
      await page.close();
    }
  } finally { await browser.close(); }
}
