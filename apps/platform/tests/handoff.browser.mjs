// Real form, mocked server action. All browser requests are isolated.
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
const dashboard = await readFile(path.join(root, "src/app/admin/page.tsx"), "utf8");
const ts = require("typescript");
const ast = ts.createSourceFile("page.tsx", dashboard, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const laneComponent = ast.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === "WorkflowLane").getText(ast);
const result = await build({ absWorkingDir: root, bundle: true, write: false, format: "iife", jsx: "automatic", define: { "process.env.NODE_ENV": '"development"' },
  stdin: { resolveDir: root, loader: "tsx", contents: `import React from 'react';import {createRoot} from 'react-dom/client';import {NextActionForm} from './src/components/NextActionForm';import {CalendarDays,ChevronDown} from 'lucide-react';
  const Link=({children,...props})=><a {...props}>{children}</a>;${laneComponent}
  createRoot(document.getElementById('root')).render(<main className="shell app-content"><section className="panel"><h2>Needs attention</h2><WorkflowLane lane={{title:'Estimates to schedule',Icon:CalendarDays,href:'/admin/communications',items:[{href:'/admin/schedule?new=1&lead=fixture',title:'Test customer',meta:'Review intake and choose a time'}]}}/></section><section className="panel next-actions-panel"><header><h2>Next actions</h2><a href="/admin/follow-ups">My follow-ups</a></header><article className="next-action-item"><strong>Call customer about the very long property access description</strong><p>{'Long scope and access details '.repeat(40)}</p></article><NextActionForm subject="customer_id" id="customer" staff={[{id:'office',full_name:'Office manager',email:null}]}/></section></main>);` },
  plugins: [{ name: "mock-action", setup(b) {
    b.onResolve({ filter: /^@\/lib\/actions\/recurring$/ }, a => ({ path: a.path, namespace: "mock" }));
    b.onLoad({ filter: /.*/, namespace: "mock" }, () => ({ loader: "js", contents: `export async function createFollowUpTask(_state,data){window.calls=(window.calls||0)+1;window.sent=[...data.entries()];await new Promise(r=>setTimeout(r,150));return window.calls===1?{status:'error',message:'Please retry this save.'}:{status:'success',message:'Saved'};}` }));
  } }],
});
const artifacts = path.join(root, "../../output/playwright/handoff"); await mkdir(artifacts, { recursive: true });
for (const engine of ["chromium", "firefox"]) {
  const browser = await playwright[engine].launch({ headless: true });
  try {
    for (const width of [320, 390, 768, 1440]) {
      const page = await browser.newPage({ viewport: { width, height: 850 } }); const errors = [];
      page.on("pageerror", error => errors.push(error.message));
      await page.route("**/*", route => route.request().url() === "http://localhost:54399/" ? route.fulfill({ contentType: "text/html", body: '<!doctype html><html><body><div id="root"></div></body></html>' }) : route.abort());
      await page.goto("http://localhost:54399/"); await page.addStyleTag({ content: css }); await page.addScriptTag({ content: result.outputFiles[0].text });
      await page.locator('.attention-queue summary').click();
      assert.equal(await page.getByRole('link', { name: 'Test customer Review intake and choose a time' }).getAttribute('href'), '/admin/schedule?new=1&lead=fixture');
      assert.equal(await page.getByRole('link', { name: 'View all estimates to schedule' }).isVisible(), true);
      await page.getByLabel("Next action", { exact: true }).fill("Call after 4 PM");
      await page.getByLabel("Internal handoff notes").fill("HOA approval\nCheck access first");
      await page.getByLabel("Due (Eastern time)").fill("2026-09-09T16:00");
      await page.getByLabel("Assigned to").selectOption("office");
      await page.getByRole("button", { name: "Save next action", exact: true }).click();
      await page.getByRole("alert").waitFor();
      assert.equal(await page.getByLabel("Next action", { exact: true }).inputValue(), "Call after 4 PM");
      assert.equal(await page.getByLabel("Internal handoff notes").inputValue(), "HOA approval\nCheck access first");
      assert.equal(await page.getByLabel("Due (Eastern time)").inputValue(), "2026-09-09T16:00");
      assert.equal(await page.getByLabel("Assigned to").inputValue(), "office");
      const firstRequest = await page.evaluate(() => window.sent.find(([key]) => key === 'request_id')[1]);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      await page.screenshot({ path: path.join(artifacts, `${engine}-${width}.png`), fullPage: true });
      await page.getByRole("button", { name: "Save next action", exact: true }).click();
      await page.getByRole("status").waitFor();
      assert.equal(await page.evaluate(() => window.calls), 2);
      assert.equal(await page.evaluate(() => window.sent.find(([key]) => key === 'request_id')[1]), firstRequest);
      assert.equal(await page.evaluate(() => window.sent.find(([key]) => key === 'assigned_to_user_id')[1]), 'office');
      await page.getByRole("button", { name: "Add another next action" }).click();
      assert.equal(await page.getByLabel("Next action", { exact: true }).inputValue(), "");
      assert.deepEqual(errors, []); console.log(`PASS ${engine} ${width}: no overflow, preserved failed form, same retry key, success feedback`);
      await page.close();
    }
  } finally { await browser.close(); }
}
