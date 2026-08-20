#!/usr/bin/env node

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "..");
const shellPath = path.join(repoRoot, "public/conversation-export.html");
const buildRoot = path.join(repoRoot, "dist/export-build");
const outputRoot = path.join(repoRoot, "dist/export");
const templatePath = path.join(outputRoot, "conversation.template.html");
const manifestPath = path.join(outputRoot, "conversation-assets.json");
const vendorAssets = require("./conversation-export-cdn-assets.json");

const ASSET_ORIGIN_MARKER =
  "__CONVERSATION_EXPORT_ASSET_ORIGIN__";
const MAX_RUNTIME_BYTES = 2 * 1024 * 1024;
const MAX_TEMPLATE_BYTES = 256 * 1024;

function replaceOnce(source, marker, replacement) {
  const first = source.indexOf(marker);
  if (first < 0 || first !== source.lastIndexOf(marker)) {
    throw new Error(`Expected exactly one ${marker} marker.`);
  }
  return (
    source.slice(0, first) + replacement + source.slice(first + marker.length)
  );
}

function packageRoot(name) {
  return path.dirname(require.resolve(`${name}/package.json`));
}

function sha256Hex(content) {
  return crypto.createHash("sha256").update(content).digest("hex");
}

function sha384Integrity(content) {
  return `sha384-${crypto.createHash("sha384").update(content).digest("base64")}`;
}

function contentType(relativePath) {
  switch (path.extname(relativePath).toLowerCase()) {
    case ".js":
      return "application/javascript; charset=utf-8";
    case ".css":
      return "text/css; charset=utf-8";
    case ".woff2":
      return "font/woff2";
    case ".woff":
      return "font/woff";
    case ".ttf":
      return "font/ttf";
    case ".txt":
      return "text/plain; charset=utf-8";
    default:
      return "application/octet-stream";
  }
}

function walkFiles(root, current = root) {
  return fs.readdirSync(current, { withFileTypes: true }).flatMap((entry) => {
    const absolute = path.join(current, entry.name);
    if (entry.isDirectory()) return walkFiles(root, absolute);
    if (!entry.isFile()) return [];
    return [path.relative(root, absolute).split(path.sep).join("/")];
  });
}

if (!fs.existsSync(buildRoot)) {
  throw new Error("Conversation export webpack output is missing.");
}

const assetFiles = new Map();
for (const relativePath of walkFiles(buildRoot)) {
  assetFiles.set(relativePath, fs.readFileSync(path.join(buildRoot, relativePath)));
}

const localVendorSources = {
  "echarts.min.js": path.join(packageRoot("echarts"), "dist/echarts.min.js"),
  "mermaid.min.js": path.join(packageRoot("mermaid"), "dist/mermaid.min.js"),
};
for (const [filename, sourcePath] of Object.entries(localVendorSources)) {
  assetFiles.set(filename, fs.readFileSync(sourcePath));
}

const runtime = assetFiles.get("runtime.js");
const css = assetFiles.get("runtime.css");
if (!runtime || !css) {
  throw new Error("Conversation export runtime.js or runtime.css is missing.");
}
if (runtime.byteLength > MAX_RUNTIME_BYTES) {
  throw new Error("Conversation export runtime exceeds 2 MiB.");
}
for (const [key, filename] of [
  ["echarts", "echarts.min.js"],
  ["mermaid", "mermaid.min.js"],
]) {
  const content = assetFiles.get(filename);
  if (!content || vendorAssets[key].integrity !== sha384Integrity(content)) {
    throw new Error(`${key} asset does not match its pinned integrity.`);
  }
}

const assetSetHash = crypto.createHash("sha256");
assetSetHash.update("conversation-export-assets\0");
for (const relativePath of [...assetFiles.keys()].sort()) {
  assetSetHash.update(relativePath);
  assetSetHash.update("\0");
  assetSetHash.update(sha256Hex(assetFiles.get(relativePath)));
  assetSetHash.update("\n");
}
const assetSet = assetSetHash.digest("hex");
const publicAssetSetPath = `/assets/conversation-export/${assetSet}`;
const assetOutputRoot = path.join(outputRoot, "assets", assetSet);

fs.rmSync(outputRoot, { recursive: true, force: true });
for (const [relativePath, content] of assetFiles) {
  const outputPath = path.join(assetOutputRoot, ...relativePath.split("/"));
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, content);
}

const runtimeIntegrity = sha384Integrity(runtime);
const cssIntegrity = sha384Integrity(css);
const csp = [
  "default-src 'none'",
  "connect-src 'none'",
  "img-src data:",
  `font-src ${ASSET_ORIGIN_MARKER}`,
  "style-src 'none'",
  `style-src-elem ${ASSET_ORIGIN_MARKER}`,
  "style-src-attr 'unsafe-inline'",
  `script-src ${ASSET_ORIGIN_MARKER}`,
  "object-src 'none'",
  "frame-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
].join("; ");

let html = fs.readFileSync(shellPath, "utf8");
const replacements = new Map([
  ["__CONVERSATION_EXPORT_ASSET_SET__", assetSet],
  ["__CONVERSATION_EXPORT_CSS_URL__", `${ASSET_ORIGIN_MARKER}${publicAssetSetPath}/runtime.css`],
  ["__CONVERSATION_EXPORT_CSS_INTEGRITY__", cssIntegrity],
  ["__CONVERSATION_EXPORT_RUNTIME_URL__", `${ASSET_ORIGIN_MARKER}${publicAssetSetPath}/runtime.js`],
  ["__CONVERSATION_EXPORT_RUNTIME_INTEGRITY__", runtimeIntegrity],
  ["__CONVERSATION_EXPORT_CSP__", csp],
]);
for (const [marker, value] of replacements) {
  html = replaceOnce(html, marker, value);
}
if (Buffer.byteLength(html) > MAX_TEMPLATE_BYTES) {
  throw new Error("Conversation export template exceeds 256 KiB.");
}
fs.writeFileSync(templatePath, html);

const files = [...assetFiles.entries()]
  .sort(([left], [right]) => left.localeCompare(right))
  .map(([relativePath, content]) => ({
    path: relativePath,
    bytes: content.byteLength,
    contentType: contentType(relativePath),
    sha256: sha256Hex(content),
    integrity: sha384Integrity(content),
  }));
fs.writeFileSync(
  manifestPath,
  `${JSON.stringify({
    profile: "conversation-export-assets",
    assetSet,
    files,
  }, null, 2)}\n`,
);
console.log(
  `Built ${path.relative(repoRoot, templatePath)} with asset set ${assetSet}.`,
);
