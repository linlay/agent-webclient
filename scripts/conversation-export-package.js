const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const marker = "__CONVERSATION_EXPORT_ASSET_SET__";
const hex = (bytes) => crypto.createHash("sha256").update(bytes).digest("hex");
const integrity = (bytes) => `sha384-${crypto.createHash("sha384").update(bytes).digest("base64")}`;
function validPath(name) {
  return typeof name === "string" && /^(?:[A-Za-z0-9._-]+\/)*[A-Za-z0-9._-]+$/u.test(name)
    && name.split("/").every((part) => part !== "." && part !== "..");
}
function contentType(name) {
  return ({ ".js": "application/javascript; charset=utf-8", ".css": "text/css; charset=utf-8",
    ".woff2": "font/woff2", ".woff": "font/woff", ".ttf": "font/ttf", ".txt": "text/plain; charset=utf-8", ".svg": "image/svg+xml" })[path.extname(name).toLowerCase()] || "application/octet-stream";
}
// Only these three positions participate in version substitution; never replace arbitrary text.
function replaceAssetSet(html, from, to) {
  if (![marker, from, to].every((v) => v === marker || /^[a-f0-9]{64}$/u.test(v))) throw new Error("Invalid asset set.");
  const patterns = [
    /(<meta\s+name="conversation-export-asset-set"\s+content=")([^"]+)("\s*\/?>)/gu,
    /(<link\b[^>]*\bhref="__CONVERSATION_EXPORT_ASSET_ORIGIN__\/assets\/conversation-export\/)([^/"\s]+)(\/runtime\.css")/gu,
    /(<script\b[^>]*\bsrc="__CONVERSATION_EXPORT_ASSET_ORIGIN__\/assets\/conversation-export\/)([^/"\s]+)(\/runtime\.js")/gu,
  ];
  for (const pattern of patterns) {
    const matches = [...html.matchAll(pattern)];
    if (matches.length !== 1 || matches[0][2] !== from) throw new Error("Invalid template version positions.");
    html = html.replace(pattern, (_, before, value, after) => before + to + after);
  }
  return html;
}
function packageHash(html, assets) {
  replaceAssetSet(html, marker, marker);
  const records = new Map([["conversation.template.html", hex(Buffer.from(html))]]);
  for (const [name, bytes] of assets) {
    if (!validPath(name) || name === "build-info.json") throw new Error(`Invalid asset path: ${name}`);
    records.set(`assets/${name}`, hex(bytes));
  }
  return hex(Buffer.from("conversation-export-package\0" + [...records.keys()].sort().map((name) => `${name}\0${records.get(name)}\n`).join("")));
}
function readBuildSource(root) {
  const git = (args) => execFileSync("git", ["-C", root, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  let gitRoot;
  try { gitRoot = git(["rev-parse", "--show-toplevel"]); } catch { /* Source archive. */ }
  if (gitRoot && fs.realpathSync(gitRoot) === fs.realpathSync(root)) {
    const commit = git(["rev-parse", "HEAD"]);
    if (!/^[a-f0-9]{40,64}$/u.test(commit)) throw new Error("Invalid Git commit.");
    return { commit, dirty: git(["status", "--porcelain", "--untracked-files=normal"]) !== "" };
  }
  const sourcePath = path.join(root, ".webclient-build-source.json");
  if (!fs.existsSync(sourcePath)) return { commit: null, dirty: null };
  let source;
  try { source = JSON.parse(fs.readFileSync(sourcePath, "utf8")); } catch { throw new Error("Malformed .webclient-build-source.json"); }
  if (!source || typeof source !== "object" || Array.isArray(source)) throw new Error("Malformed build source object.");
  const commit = source.commit === undefined || source.commit === "unknown" ? null : source.commit;
  const dirty = source.dirty === undefined ? null : source.dirty;
  validateBuild({ commit, dirty });
  return { commit, dirty };
}
function validateBuild(build) {
  if (!build || JSON.stringify(Object.keys(build).sort()) !== JSON.stringify(["commit", "dirty"]) || !Object.hasOwn(build, "commit") || !Object.hasOwn(build, "dirty")
    || !(build.commit === null || /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/u.test(build.commit))
    || !(build.dirty === null || typeof build.dirty === "boolean")) throw new Error("Invalid build provenance.");
}
function filesUnder(root, current = "") {
  return fs.readdirSync(path.join(root, current), { withFileTypes: true }).flatMap((entry) => {
    const name = current ? `${current}/${entry.name}` : entry.name;
    if (!validPath(name)) throw new Error(`Invalid package path: ${name}`);
    if (entry.isDirectory()) return filesUnder(root, name);
    if (!entry.isFile()) throw new Error(`Non-regular package entry: ${name}`);
    return [name];
  }).sort();
}
function validatePackage(root) {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, "conversation-assets.json"), "utf8"));
  if (JSON.stringify(Object.keys(manifest).sort()) !== JSON.stringify(["assetSet", "build", "files", "profile"])
    || manifest.profile !== "conversation-export-assets" || !/^[a-f0-9]{64}$/u.test(manifest.assetSet)
    || !Array.isArray(manifest.files)) throw new Error("Invalid package manifest.");
  validateBuild(manifest.build);
  const html = fs.readFileSync(path.join(root, "conversation.template.html"), "utf8");
  const assets = new Map();
  for (const file of manifest.files) {
    if (!validPath(file.path) || assets.has(file.path)) throw new Error("Invalid or duplicate asset path.");
    const bytes = fs.readFileSync(path.join(root, "assets", manifest.assetSet, file.path));
    if (file.bytes !== bytes.length || file.sha256 !== hex(bytes) || file.integrity !== integrity(bytes) || file.contentType !== contentType(file.path)) throw new Error(`Asset metadata mismatch: ${file.path}`);
    assets.set(file.path, bytes);
  }
  const expected = ["conversation.template.html", "conversation-assets.json", ...[...assets.keys()].map((name) => `assets/${manifest.assetSet}/${name}`)].sort();
  if (JSON.stringify(expected) !== JSON.stringify(filesUnder(root))) throw new Error("Package file set differs from manifest.");
  if (packageHash(replaceAssetSet(html, manifest.assetSet, marker), assets) !== manifest.assetSet) throw new Error("Package content hash mismatch.");
  return { manifest, files: expected };
}
module.exports = { packageHash, replaceAssetSet, readBuildSource, validatePackage, contentType, marker };
