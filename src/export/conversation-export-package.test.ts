import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
const { packageHash, replaceAssetSet, readBuildSource, marker, validatePackage } = require('../../scripts/conversation-export-package');
const { packageExport } = require('../../scripts/package-conversation-export');
const JSZip = require('jszip');
const crypto = require('node:crypto');
const html = `<meta name="conversation-export-asset-set" content="${marker}" />\n<link href="__CONVERSATION_EXPORT_ASSET_ORIGIN__/assets/conversation-export/${marker}/runtime.css">\n<script src="__CONVERSATION_EXPORT_ASSET_ORIGIN__/assets/conversation-export/${marker}/runtime.js"></script>\n`;
const assets = new Map([['runtime.js', Buffer.from('hello\n')], ['runtime.css', Buffer.from('body{}\n')]]);
let root: string;
beforeEach(() => { root = fs.mkdtempSync(path.join(os.tmpdir(), 'conversation-package-test-')); });
afterEach(() => fs.rmSync(root, { recursive: true, force: true }));
function writePackage(build = { commit: 'a'.repeat(40), dirty: false }) {
  const assetSet = packageHash(html, assets);
  const out = path.join(root, 'dist/export');
  fs.mkdirSync(path.join(out, 'assets', assetSet), { recursive: true });
  const files = [...assets].map(([name, bytes]) => {
    fs.writeFileSync(path.join(out, 'assets', assetSet, name), bytes);
    return { path: name, bytes: bytes.length, contentType: name.endsWith('.js') ? 'application/javascript; charset=utf-8' : 'text/css; charset=utf-8', sha256: crypto.createHash('sha256').update(bytes).digest('hex'), integrity: 'sha384-' + crypto.createHash('sha384').update(bytes).digest('base64') };
  });
  fs.writeFileSync(path.join(out, 'conversation.template.html'), replaceAssetSet(html, marker, assetSet));
  fs.writeFileSync(path.join(out, 'conversation-assets.json'), JSON.stringify({ profile: 'conversation-export-assets', assetSet, build, files }));
  return { out, assetSet };
}
test('fixed content digest covers HTML, sprite bytes, resource bytes and paths', () => {
  expect(packageHash(html, assets)).toBe('daa33d629a573d1819a4fb5f32f570e59cb57f9c509de32a2feca53658eed02a');
  expect(packageHash(html + '<svg/>', assets)).not.toBe(packageHash(html, assets));
  expect(packageHash(html, new Map([...assets, ['icon.svg', Buffer.from('x')]]))).not.toBe(packageHash(html, assets));
  expect(packageHash(html, new Map([['changed.js', Buffer.from('hello\n')], ['runtime.css', Buffer.from('body{}\n')]]))).not.toBe(packageHash(html, assets));
  expect(packageHash(html, new Map([['runtime.js', Buffer.from('changed')], ['runtime.css', Buffer.from('body{}\n')]]))).not.toBe(packageHash(html, assets));
  expect(() => packageHash(html, new Map([['../x', Buffer.from('x')]]))).toThrow();
  expect(() => replaceAssetSet(html + html, marker, 'a'.repeat(64))).toThrow();
  expect(replaceAssetSet(html + marker, marker, 'a'.repeat(64)).endsWith(marker)).toBe(true);
});
test('provenance and ZIP metadata do not affect identity; packaging retains frozen source', async () => {
  const first = writePackage();
  const second = writePackage({ commit: 'b'.repeat(40), dirty: true });
  expect(first.assetSet).toBe(second.assetSet);
  fs.writeFileSync(path.join(root, '.webclient-build-source.json'), JSON.stringify({ commit: 'c'.repeat(40) }));
  const output = await packageExport(root);
  const zip = await JSZip.loadAsync(fs.readFileSync(output));
  expect(JSON.parse(await zip.file('conversation-assets.json').async('string')).build).toEqual({ commit: 'b'.repeat(40), dirty: true });
  const reverse = new JSZip();
  for (const name of Object.keys(zip.files).reverse()) reverse.file(name, await zip.file(name).async('nodebuffer'), { createFolders: false });
  const repacked = await JSZip.loadAsync(await reverse.generateAsync({ type: 'nodebuffer', compression: 'STORE' }));
  for (const name of Object.keys(repacked.files)) fs.writeFileSync(path.join(second.out, name), await repacked.file(name).async('nodebuffer'));
  expect(validatePackage(second.out).manifest.assetSet).toBe(first.assetSet);
  const mf = path.join(second.out, 'conversation-assets.json');
  const manifest = JSON.parse(fs.readFileSync(mf, 'utf8')); manifest.files[0].contentType = 'wrong'; fs.writeFileSync(mf, JSON.stringify(manifest));
  await expect(packageExport(root)).rejects.toThrow('metadata');
});
test('source archive nulls, malformed source, own Git and parent Git', () => {
  expect(readBuildSource(root)).toEqual({ commit: null, dirty: null });
  const source = path.join(root, '.webclient-build-source.json');
  fs.writeFileSync(source, JSON.stringify({ commit: 'a'.repeat(40) }));
  expect(readBuildSource(root)).toEqual({ commit: 'a'.repeat(40), dirty: null });
  fs.writeFileSync(source, '{'); expect(() => readBuildSource(root)).toThrow('Malformed'); fs.rmSync(source);
  const git = (...args: string[]) => execFileSync('git', ['-C', root, ...args], { stdio: ['ignore', 'pipe', 'pipe'] }).toString().trim();
  git('init'); git('-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', 'commit', '--allow-empty', '-m', 'fixture');
  expect(readBuildSource(root)).toEqual({ commit: git('rev-parse', 'HEAD'), dirty: false });
  fs.writeFileSync(path.join(root, 'change'), 'x'); expect(readBuildSource(root).dirty).toBe(true);
  const child = path.join(root, 'child'); fs.mkdirSync(child);
  expect(readBuildSource(child)).toEqual({ commit: null, dirty: null });
});
test('explicit sync reuses identical sets, rejects conflicts and keeps historical bytes', () => {
  const { assetSet } = writePackage();
  const scriptDir = path.join(root, 'scripts'); fs.mkdirSync(scriptDir);
  for (const name of ['sync-conversation-export-artifacts.js', 'conversation-export-package.js']) fs.copyFileSync(path.resolve(__dirname, '../../scripts', name), path.join(scriptDir, name));
  // The maintenance command intentionally targets a sibling; isolate both repos under the fixture.
  const web = path.join(root, 'web'); fs.mkdirSync(web);
  fs.renameSync(scriptDir, path.join(web, 'scripts')); fs.renameSync(path.join(root, 'dist'), path.join(web, 'dist'));
  const old = path.join(root, 'tunnel-hub-server/internal/shareassets/files', 'c'.repeat(64)); fs.mkdirSync(old, { recursive: true }); fs.writeFileSync(path.join(old, 'runtime.js'), 'history');
  const run = (...args: string[]) => execFileSync(process.execPath, [path.join(web, 'scripts/sync-conversation-export-artifacts.js'), ...args], { stdio: 'pipe' });
  run(); run(); run('--check');
  const destination = path.join(root, 'tunnel-hub-server/internal/shareassets/files', assetSet, 'runtime.js');
  fs.writeFileSync(destination, 'conflict'); expect(() => run()).toThrow();
  expect(fs.readFileSync(destination, 'utf8')).toBe('conflict');
  expect(fs.readFileSync(path.join(old, 'runtime.js'), 'utf8')).toBe('history');
});
