#!/usr/bin/env node
/**
 * verify-pack48-client.mjs — focused, OFFLINE, deterministic validation for the
 * canonical Pack48 client contract (Economy v10). Dependency-free at the package
 * level: it transpiles the two real TypeScript service modules and runs assertions
 * with an injected fake callable factory + injected UUID generator. It NEVER
 * initializes a live Firebase app, hits Firestore/Functions, calls a provider, or
 * touches production/staging config (the wrapper only builds a callable via an
 * injected factory in these tests; expo-crypto is lazy and never reached).
 *
 * ZERO-DOWNLOAD POLICY (P1-PAID-MEDIA-R2-NO-DOWNLOAD-RUNNER-AND-EMULATOR-CLOSURE-R3):
 * the previous fallback invoked npx esbuild in auto-download-consent mode, which
 * DOWNLOADS a package when esbuild is not installed locally. That fallback is REMOVED. Transpiler resolution:
 *   1. an already-installed, platform-compatible esbuild
 *      (app-mobile/services, app-mobile, repo root node_modules chains);
 *   2. the already-installed TypeScript compiler API (ts.transpileModule) resolved
 *      from app-mobile, repo root, or functions/node_modules — per-module CommonJS
 *      transpile, no bundling needed (the wrapper has NO top-level firebase import;
 *      relative imports are colocated in the temp dir);
 *   3. stable failure: LOCAL_TRANSPILER_UNAVAILABLE. This runner NEVER downloads.
 *
 * Usage: node scripts/verify-pack48-client.mjs   (from app-mobile/)
 */

import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import path from 'node:path';

const require = createRequire(import.meta.url);

const here = path.dirname(fileURLToPath(import.meta.url));
const selfPath = fileURLToPath(import.meta.url);
const appMobileRoot = path.resolve(here, '..');
const repoRoot = path.resolve(here, '..', '..');
const servicesDir = path.resolve(appMobileRoot, 'services');
const clientIdAbs = path.join(servicesDir, 'clientMessageId').replace(/\\/g, '/');
const wrapperAbs = path.join(servicesDir, 'pack48CompanionClient').replace(/\\/g, '/');
const wrapperSrcPath = path.join(servicesDir, 'pack48CompanionClient.ts');
const clientIdSrcPath = path.join(servicesDir, 'clientMessageId.ts');

// Forbidden Firestore/provider call tokens, built from fragments so THIS script does
// not itself contain the literal tokens (avoids self-match traps for other scanners).
const FORBIDDEN_CALLS = [
  'add' + 'Doc', 'set' + 'Doc', 'update' + 'Doc', 'delete' + 'Doc',
  'get' + 'Doc', 'get' + 'Docs', 'on' + 'Snapshot', 'write' + 'Batch',
  'run' + 'Transaction', 'incre' + 'ment', 'colle' + 'ction',
];
const FIRESTORE_IMPORT = 'firebase/' + 'firestore';

// The 14 runtime assertions below are UNCHANGED from the accepted runner version.
const harnessFor = (clientIdSpec, wrapperSpec) => `
import { PendingMessageIdRegistry, __setUuidFnForTests, generateClientMessageId } from ${JSON.stringify(clientIdSpec)};
import { sendMessage, startConversation, Pack48ClientError, PACK48_CALLABLES } from ${JSON.stringify(wrapperSpec)};
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL:', m); } };
const seqGen = () => { let n = 0; return () => 'cmid-' + (++n); };
const rec = () => { const calls = []; const factory = (name) => async (payload) => { calls.push({ name, payload }); return { data: { ok: true } }; }; return { factory, calls }; };
(async () => {
  // clientMessageId lifecycle
  __setUuidFnForTests(seqGen());
  ok(generateClientMessageId() === 'cmid-1', 'gen injected 1');
  ok(generateClientMessageId() === 'cmid-2', 'gen injected 2');
  __setUuidFnForTests(null);
  const reg = new PendingMessageIdRegistry(seqGen());
  ok(reg.getOrCreate('k1') === 'cmid-1', 'one id per pending message');
  ok(reg.getOrCreate('k1') === 'cmid-1', 'retry reuses id');
  ok(reg.getOrCreate('k1') === 'cmid-1', 'double-tap reuses id');
  reg.clear('k1');
  ok(reg.has('k1') === false, 'clear releases');
  ok(reg.getOrCreate('k1') === 'cmid-2', 'new logical message gets new id after clear');
  ok(reg.getOrCreate('k2') === 'cmid-3', 'distinct pending messages get distinct ids');
  // sendMessage wrapper
  const r1 = rec();
  await sendMessage({ conversationId: 'c1', companionId: 'comp1', userMessage: 'hi', clientMessageId: 'cmid-1' }, { callableFactory: r1.factory });
  ok(r1.calls.length === 1 && r1.calls[0].name === PACK48_CALLABLES.sendMessage, 'sendMessage targets canonical callable');
  ok(JSON.stringify(r1.calls[0].payload) === JSON.stringify({ conversationId: 'c1', companionId: 'comp1', userMessage: 'hi', clientMessageId: 'cmid-1' }), 'payload includes clientMessageId');
  const r2 = rec(); let t1 = false;
  try { await sendMessage({ conversationId: 'c1', companionId: 'comp1', userMessage: 'hi', clientMessageId: '' }, { callableFactory: r2.factory }); } catch (e) { t1 = e instanceof Pack48ClientError; }
  ok(t1 && r2.calls.length === 0, 'missing clientMessageId fails locally, no network call');
  const r3 = rec(); let t2 = false;
  try { await sendMessage({ conversationId: 'c1', companionId: 'comp1', userMessage: '   ', clientMessageId: 'cmid-1' }, { callableFactory: r3.factory }); } catch (e) { t2 = e && e.code === 'PACK48_EMPTY_MESSAGE'; }
  ok(t2 && r3.calls.length === 0, 'empty text fails locally, no network call');
  const r4 = rec(); const reg2 = new PendingMessageIdRegistry(seqGen()); const key = 'c1:d1'; const cmid = reg2.getOrCreate(key);
  await sendMessage({ conversationId: 'c1', companionId: 'comp1', userMessage: 'hi', clientMessageId: cmid }, { callableFactory: r4.factory });
  await sendMessage({ conversationId: 'c1', companionId: 'comp1', userMessage: 'hi', clientMessageId: reg2.getOrCreate(key) }, { callableFactory: r4.factory });
  ok(JSON.stringify(r4.calls.map(c => c.payload.clientMessageId)) === JSON.stringify(['cmid-1', 'cmid-1']), 'retry sends same clientMessageId (no double-debit id)');
  const r5 = rec();
  await startConversation('comp1', { callableFactory: r5.factory });
  ok(r5.calls[0].name === PACK48_CALLABLES.startConversation && r5.calls[0].payload.companionId === 'comp1', 'startConversation forwards companionId');
  console.log('\\nRESULT PASS ' + pass + ' FAIL ' + fail);
  process.exit(fail ? 1 : 0);
})();
`;

// --- no-download self-check: this runner must contain NO download mechanism -------
// Tokens are fragment-built so this check does not match itself.
{
  const self = readFileSync(selfPath, 'utf8');
  const DOWNLOAD_TOKENS = [
    'npx ' + '--yes', 'npx' + '.cmd', 'npm ' + 'exec', 'pnpm ' + 'dlx',
    'yarn ' + 'dlx', 'curl ' + 'http', 'wget ' + 'http', 'npm ' + 'install', 'npm ' + 'i -',
  ];
  const hits = DOWNLOAD_TOKENS.filter((t) => self.includes(t));
  if (hits.length) {
    console.log('NO-DOWNLOAD FAIL: runner contains download mechanism token(s): ' + hits.join(', '));
    process.exit(1);
  }
  console.log('no-download: PASS (runner contains no package-download mechanism)');
}

// --- source-safety: the wrapper must be callable-only (no Firestore/provider I/O) ---
const src = readFileSync(wrapperSrcPath, 'utf8');
let safetyFail = 0;
for (const tok of FORBIDDEN_CALLS) {
  const re = new RegExp('\\b' + tok + '\\s*\\(');
  if (re.test(src)) { console.log('SOURCE-SAFETY FAIL: wrapper calls ' + tok + '(...)'); safetyFail++; }
}
if (src.includes(FIRESTORE_IMPORT)) { console.log('SOURCE-SAFETY FAIL: wrapper imports ' + FIRESTORE_IMPORT); safetyFail++; }
if (!src.includes('clientMessageId')) { console.log('SOURCE-SAFETY FAIL: wrapper missing clientMessageId contract'); safetyFail++; }
if (safetyFail) { console.log('source-safety checks failed: ' + safetyFail); process.exit(1); }
console.log('source-safety: PASS (callable-only, no Firestore mutation / provider I/O)');

// --- transpile with LOCAL tooling only (never download) --------------------------
const RESOLVE_PATHS = [servicesDir, appMobileRoot, repoRoot, path.join(repoRoot, 'functions')];

const esbuildArgs = (entry, out) => [
  entry, '--bundle', '--platform=node',
  '--external:firebase/*', '--external:expo-crypto', '--log-level=error', '--outfile=' + out,
];

/** Priority 1: an already-installed esbuild, run with the current Node binary. */
function tryLocalEsbuild(entry, out) {
  let bin;
  try {
    bin = require.resolve('esbuild/bin/esbuild', { paths: RESOLVE_PATHS });
  } catch {
    return { usable: false, reason: 'esbuild not installed locally' };
  }
  const r = spawnSync(process.execPath, [bin, ...esbuildArgs(entry, out)], {
    stdio: ['ignore', 'ignore', 'pipe'], encoding: 'utf8',
  });
  if (!r.error && r.status === 0) return { usable: true };
  // Wrong-platform binary or broken install: report and FALL THROUGH to TypeScript.
  const detail = (r.stderr || '').trim() || (r.error && r.error.code) || ('exit ' + r.status);
  return { usable: false, reason: 'local esbuild present but failed: ' + detail };
}

/** Priority 2: already-installed TypeScript compiler API — per-module CJS transpile. */
function tryTypescriptTranspile(work) {
  let tsPath;
  try {
    tsPath = require.resolve('typescript', { paths: RESOLVE_PATHS });
  } catch {
    return { usable: false, reason: 'typescript not installed locally' };
  }
  const ts = require(tsPath);
  const opts = {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
    },
    reportDiagnostics: true,
  };
  const emit = (tsSource, fileName, outName) => {
    const res = ts.transpileModule(tsSource, { ...opts, fileName });
    const diags = res.diagnostics || [];
    if (diags.length) {
      for (const d of diags) console.log('TS DIAG:', ts.flattenDiagnosticMessageText(d.messageText, ' '));
      throw new Error('TypeScript transpile diagnostics in ' + fileName);
    }
    writeFileSync(path.join(work, outName), res.outputText, 'utf8');
  };
  emit(readFileSync(clientIdSrcPath, 'utf8'), clientIdSrcPath, 'clientMessageId.js');
  emit(readFileSync(wrapperSrcPath, 'utf8'), wrapperSrcPath, 'pack48CompanionClient.js');
  emit(harnessFor('./clientMessageId', './pack48CompanionClient'), 'harness.ts', 'harness.js');
  return { usable: true, transpiler: 'typescript@' + ts.version + ' (' + tsPath + ')' };
}

function runNode(file) {
  const r = spawnSync(process.execPath, [file], { stdio: 'inherit' });
  if (r.error) throw new Error('failed to run harness: ' + r.error.code);
  if (r.status !== 0) process.exit(r.status || 1);
}

const work = mkdtempSync(path.join(tmpdir(), 'pack48-verify-'));
try {
  const entry = path.join(work, 'harness.entry.ts');
  const bundled = path.join(work, 'harness.bundle.cjs');
  writeFileSync(entry, harnessFor(clientIdAbs, wrapperAbs), 'utf8');
  const eb = tryLocalEsbuild(entry, bundled);
  if (eb.usable) {
    console.log('transpiler: local esbuild');
    runNode(bundled);
  } else {
    console.log('esbuild unavailable (' + eb.reason + '); trying local TypeScript API');
    const tsr = tryTypescriptTranspile(work);
    if (!tsr.usable) {
      console.log('LOCAL_TRANSPILER_UNAVAILABLE: no locally installed esbuild or typescript found in',
        RESOLVE_PATHS.join(' | '));
      console.log('This runner NEVER downloads. Install esbuild or typescript locally, then re-run.');
      process.exit(1);
    }
    console.log('transpiler: ' + tsr.transpiler);
    runNode(path.join(work, 'harness.js'));
  }
} finally {
  rmSync(work, { recursive: true, force: true });
}
