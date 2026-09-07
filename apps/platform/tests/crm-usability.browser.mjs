// Isolated real-component checks. Set ESBUILD_MODULE and PLAYWRIGHT_MODULE when
// those optional testing tools are not installed locally. No CRM login/data used.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
const require = createRequire(import.meta.url);
const { build } = require(process.env.ESBUILD_MODULE || "esbuild");
const playwright = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const root = fileURLToPath(new URL("../", import.meta.url));
const css = await readFile(path.join(root, "src/styles/globals.css"), "utf8");
const mocks = {
  "next/navigation": `const router={prefetch(){},push(h){window.destination=h},replace(h){window.destination=h;window.dismissModal?.()}};export const useRouter=()=>router;export const usePathname=()=>'/admin/quotes';`,
  "next/link": `import React from 'react';export default function Link({href,children,prefetch,scroll,onClick,...props}){return <a {...props} href={href} onClick={e=>{onClick?.(e);if(!e.defaultPrevented){e.preventDefault();window.destination=href}}}>{children}</a>}`,
  "@/app/login/actions": `export async function signOut(){}`,
  "@/lib/address/google-places-loader": `export async function loadGooglePlacesLibrary(){return {AutocompleteSessionToken:class{},AutocompleteSuggestion:{fetchAutocompleteSuggestions:async()=>({suggestions:[{placePrediction:{text:{text:'5802 Ford Rd'},mainText:{text:'5802 Ford Rd'},secondaryText:{text:'Fredericksburg, VA'},toPlace:()=>({fetchFields:async()=>{},addressComponents:[]})}}]})}}}`,
};
const bundled = await build({
  absWorkingDir: root, bundle: true, write: false, format: "iife", jsx: "automatic",
  define: { "process.env.NODE_ENV": '"development"', "process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY": '"test-fixture"' },
  stdin: { resolveDir: root, loader: "tsx", contents: `
    import React,{useState} from 'react';import {createRoot} from 'react-dom/client';
    import {PlatformNavigation} from './src/components/PlatformNavigation';
    import {PlatformModal} from './src/components/platform-modal';
    import {StructuredAddressFields} from './src/components/address-autocomplete';
    function Fixture(){const [open,setOpen]=useState(false);const [nested,setNested]=useState(false);
      window.dismissModal=()=>setOpen(false);
      return <div className="app-shell"><PlatformNavigation audience="admin" roles={['owner']} userEmail="test@example.invalid" />
      <main className="app-main" id="platform-main-content" tabIndex={-1}><h1>Fixture</h1><button onClick={()=>setOpen(true)}>Open schedule fixture</button><button>Background action</button>
      {open&&<PlatformModal className="appointment-overlay" labelledBy="fixture-title" closeHref="/admin/schedule"><div className="appointment-backdrop"/>
      <aside className="appointment-popover"><div className="appointment-drawer-header"><h2 id="fixture-title">Estimate with a long customer name and readable details</h2><button data-modal-initial-focus onClick={()=>setOpen(false)}>Close estimate</button></div>
      <StructuredAddressFields names={{street:'street',city:'city',state:'state',postalCode:'zip'}}/>
      <button onClick={()=>setNested(true)}>Nested confirmation</button>
      {nested&&<PlatformModal className="command-palette-layer" label="Nested confirmation" onDismiss={()=>setNested(false)}><section className="command-palette"><button data-modal-initial-focus onClick={()=>setNested(false)}>Cancel nested</button></section></PlatformModal>}
      {Array.from({length:35},(_,i)=><p key={i}>Long service scope {i}. Multiline work details remain reachable.</p>)}<button>Last action</button></aside></PlatformModal>}
      </main></div>}
    createRoot(document.getElementById('root')).render(<Fixture/>);
  ` },
  plugins: [{ name: "isolated-server-mocks", setup(b) {
    b.onResolve({ filter: /^(next\/|@\/app\/login\/actions|@\/lib\/address\/google-places-loader)/ }, a => mocks[a.path] ? { path: a.path, namespace: "mock" } : undefined);
    b.onLoad({ filter: /.*/, namespace: "mock" }, a => ({ contents: mocks[a.path], loader: "jsx", resolveDir: root }));
  } }],
});
const artifacts = path.join(root, "../../output/playwright/crm-usability");
await mkdir(artifacts, { recursive: true });
for (const engine of (process.env.UI_BROWSERS || "chromium,firefox").split(",")) {
  const browser = await playwright[engine].launch({ headless: true });
  try {
    for (const width of [320, 390, 768, 1440]) {
      const page = await browser.newPage({ viewport: { width, height: 850 } });
      const errors = [];
      page.on("pageerror", error => errors.push(error.message));
      let rejectRead = true;
      await page.route("**/*", route => {
        const request = route.request();
        if (request.url().includes("/api/admin/notifications")) {
          if (request.method() === "PATCH") return route.fulfill({ status: rejectRead ? 500 : 204, body: "" });
          return route.fulfill({ json: { unreadCount: 1, notifications: [{ id: "fixture", title: "Customer activity", body: "A customer viewed the proposal.", category: "quote", created_at: new Date().toISOString(), read_at: null, destination_path: "/admin/quotes/fixture" }] } });
        }
        if (request.url() === "http://crm.test/") return route.fulfill({ contentType: "text/html", body: '<!doctype html><html lang="en"><head><title>CRM UI test</title></head><body><div id="root"></div></body></html>' });
        return route.abort();
      });
      await page.goto("http://crm.test/");
      await page.addStyleTag({ content: css });
      await page.addScriptTag({ content: bundled.outputFiles[0].text });
      await page.getByRole("heading", { name: "Fixture", exact: true }).waitFor();
      const overflow = () => page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
      assert.equal(await overflow(), false, `${engine} ${width}: page overflow`);
      if (width < 980) {
        await page.getByRole("button", { name: "Open navigation", exact: true }).click();
        await page.getByRole("dialog", { name: "Platform navigation", exact: true }).waitFor();
        assert.equal(await page.evaluate(() => document.activeElement.getAttribute('aria-label')), 'Close navigation');
        const targetHeight = await page.locator('.mobile-navigation-drawer .navigation-links a').first().evaluate(el=>el.getBoundingClientRect().height);
        assert.ok(targetHeight >= 44);
        await page.keyboard.press("Escape");
        assert.equal(await page.getByRole("button", { name: "Open navigation", exact: true }).evaluate(el=>el===document.activeElement), true);
      }
      await page.keyboard.press("Control+k");
      const combo = page.getByRole("combobox", { name: "Find a page or action" });
      await combo.waitFor();
      await page.keyboard.press("ArrowDown");
      assert.ok(await combo.evaluate(el=>document.getElementById(el.getAttribute('aria-activedescendant'))?.getAttribute('aria-selected')==='true'));
      await combo.fill("zzzz no result");
      await page.keyboard.press("ArrowDown");
      assert.equal(await combo.getAttribute("aria-activedescendant"), null);
      await combo.fill("invoice");
      await page.screenshot({ path: path.join(artifacts, `${engine}-${width}-palette.png`) });
      await page.keyboard.press("Tab");
      await page.keyboard.press("Escape");
      assert.equal(await page.locator('dialog[open]').count(), 0);
      await page.getByRole("button", { name: "Open schedule fixture" }).click();
      await page.getByRole("button", { name: "Close estimate" }).waitFor();
      await page.getByRole("combobox", { name: "Street address", exact: true }).fill("5802");
      const option = page.getByRole("option", { name: /5802/ });
      await option.waitFor();
      assert.equal(await option.evaluate(el=>Boolean(el.closest('dialog[open]'))), true);
      await page.keyboard.press("Escape");
      assert.equal(await page.locator('dialog[open]').count(), 1, 'autocomplete Escape must not close schedule');
      await page.getByRole("button", { name: "Nested confirmation", exact: true }).click();
      await page.getByRole("dialog", { name: "Nested confirmation", exact: true }).waitFor();
      await page.keyboard.press("Escape");
      assert.equal(await page.locator('dialog[open]').count(), 1);
      assert.equal(await page.evaluate(()=>document.body.style.overflow), "hidden");
      await page.getByRole("button", { name: "Last action" }).focus();
      await page.keyboard.press("Tab");
      await page.keyboard.press("Tab");
      assert.ok(await page.evaluate(()=>document.activeElement===document.body || Boolean(document.activeElement.closest('dialog[open]'))));
      assert.equal(await overflow(), false);
      await page.screenshot({ path: path.join(artifacts, `${engine}-${width}-schedule.png`) });
      await page.keyboard.press("Escape");
      assert.equal(await page.evaluate(()=>document.body.style.overflow), "");
      assert.equal(await page.getByRole("button", { name: "Open schedule fixture" }).evaluate(el=>el===document.activeElement), true);
      await page.getByRole("button", { name: /Notifications, 1 unread/ }).click();
      await page.getByRole("link", { name: /Customer activity/ }).click();
      await page.waitForFunction(()=>window.destination==='/admin/quotes/fixture');
      await page.getByRole("button", { name: /Notifications/ }).click();
      await page.getByRole("button", { name: "Retry marking as read" }).waitFor();
      rejectRead = false;
      await page.getByRole("button", { name: "Retry marking as read" }).click();
      await page.getByRole("button", { name: "Retry marking as read" }).waitFor({ state: "hidden" });
      assert.deepEqual(errors, []);
      console.log(`PASS ${engine} ${width}px: keyboard, nesting, search, address portal, notification failure/retry, containment`);
      await page.close();
    }
  } finally { await browser.close(); }
}
