import { createRequire } from 'node:module';
import { writeFile, readFile } from 'node:fs/promises';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
const here = dirname(fileURLToPath(import.meta.url)), root = resolve(here, '../crm-runtime/source');
const dependencyRoot = '/Users/noelsierra/Documents/Codex/2026-10-29/firewood-finalization/recovery/private-release/source/apps/platform';
const require = createRequire(import.meta.url), ts = require(join(dependencyRoot, 'node_modules/typescript'));
const config = ts.readConfigFile(join(root, 'tsconfig.json'), ts.sys.readFile), parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, root);
const options = { ...parsed.options, incremental: false, typeRoots: [join(dependencyRoot, 'node_modules/@types')], types: ['node'], noEmit: true };
const host = ts.createCompilerHost(options), normal = (name, file) => ts.resolveModuleName(name, file, options, host).resolvedModule;
host.resolveModuleNames = (names, file) => names.map(name => normal(name, file)
  ?? (!name.startsWith('.') && !name.startsWith('@/') ? normal(name, join(dependencyRoot, 'read-only-type-resolver.ts')) : undefined));
const files = ['next-env.d.ts', 'src/lib/email/delivery.ts', 'src/lib/email/send.ts', 'src/lib/email/firewood-receipt-admission.ts'].map(file => join(root, file));
const program = ts.createProgram(files, options, host);
const diagnostics = ts.getPreEmitDiagnostics(program).map(d => ({ code: d.code, category: ts.DiagnosticCategory[d.category],
  file: d.file?.fileName, line: d.file && d.start !== undefined ? d.file.getLineAndCharacterOfPosition(d.start).line + 1 : null,
  message: ts.flattenDiagnosticMessageText(d.messageText, '\n') }));
const sources = [];
for (const file of files) sources.push({ file, sha256: createHash('sha256').update(await readFile(file)).digest('hex') });
const proof = { scope: 'focused-receipt-dispatcher-and-provider-boundary-typecheck-no-installs', node: process.versions.node,
  typescript: ts.version, filesRead: program.getSourceFiles().length, roots: sources, diagnostics, passed: diagnostics.length === 0 };
await writeFile(join(here, 'RECEIPT_TYPECHECK_PROOF.json'), JSON.stringify(proof, null, 2) + '\n');
console.log(JSON.stringify({ passed: proof.passed, filesRead: proof.filesRead, diagnostics }));
if (!proof.passed) process.exitCode = 1;
