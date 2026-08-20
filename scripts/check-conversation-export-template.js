#!/usr/bin/env node

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "..");
const packageJson = require(path.join(repoRoot, "package.json"));
const vendorAssets = require("./conversation-export-cdn-assets.json");
const exportRoot = path.join(repoRoot, "dist/export");
const templatePath = path.join(exportRoot, "conversation.template.html");
const manifestPath = path.join(exportRoot, "conversation-assets.json");
const html = fs.readFileSync(templatePath, "utf8");
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
const marker = "__CONVERSATION_EXPORT_SNAPSHOT_JSON_V1__";
const assetOriginMarker =
  "__CONVERSATION_EXPORT_ASSET_ORIGIN__";
const profile =
  '<meta name="conversation-export-profile" content="conversation-snapshot-json-v1"';
const snapshotElementID = "conversation-snapshot";
const runtimeElementID = "conversation-export-runtime";
const brandCoupledProtocol =
  /__ZENMIND|zenmind-export|zenmind-mermaid|X-ZenMind-(?:Tunnel|Conversation)/iu;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function sha256(content) {
  return crypto.createHash("sha256").update(content).digest("hex");
}

function integrity(content) {
  return `sha384-${crypto.createHash("sha384").update(content).digest("base64")}`;
}

function walkFiles(root, current = root) {
  return fs.readdirSync(current, { withFileTypes: true }).flatMap((entry) => {
    const absolute = path.join(current, entry.name);
    if (entry.isDirectory()) return walkFiles(root, absolute);
    if (!entry.isFile()) return [];
    return [path.relative(root, absolute).split(path.sep).join("/")];
  });
}

assert(
  manifest.profile === "conversation-export-assets"
    && /^[a-f0-9]{64}$/u.test(manifest.assetSet)
    && Array.isArray(manifest.files)
    && JSON.stringify(Object.keys(manifest).sort())
      === JSON.stringify(["assetSet", "files", "profile"]),
  "Conversation export asset manifest is invalid.",
);
const publicAssetSetPath = `/assets/conversation-export/${manifest.assetSet}`;
const assetRoot = path.join(exportRoot, "assets", manifest.assetSet);
const actualFiles = walkFiles(assetRoot).sort();
const manifestFiles = manifest.files.map((file) => file.path).sort();
assert(
  JSON.stringify(actualFiles) === JSON.stringify(manifestFiles),
  "Conversation export asset directory and manifest differ.",
);
for (const file of manifest.files) {
  const content = fs.readFileSync(path.join(assetRoot, ...file.path.split("/")));
  assert(
    file.bytes === content.byteLength
      && file.sha256 === sha256(content)
      && file.integrity === integrity(content),
    `Conversation export asset ${file.path} failed digest verification.`,
  );
  if (/\.(?:js|css|txt)$/iu.test(file.path)) {
    assert(
      !brandCoupledProtocol.test(content.toString("utf8")),
      `Conversation export asset ${file.path} contains a brand-coupled identifier.`,
    );
  }
}

assert(
  html.indexOf(marker) === html.lastIndexOf(marker) && html.includes(marker),
  "Snapshot marker must appear exactly once.",
);
assert(
  !brandCoupledProtocol.test(html),
  "Export template contains a brand-coupled protocol identifier.",
);
assert(
  html.indexOf(profile) === html.lastIndexOf(profile) && html.includes(profile),
  "Export profile must appear exactly once.",
);
assert(
  html.includes(
    `<meta\n      name="conversation-export-asset-set"\n      content="${manifest.assetSet}"`,
  ),
  "Export template asset-set declaration does not match the manifest.",
);
assert(!/<style\b/iu.test(html), "Export template contains an inline style element.");
assert(
  !/\son[a-z]+\s*=/iu.test(html),
  "Export template contains an inline event handler.",
);

const scripts = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/giu)];
assert(scripts.length === 2, "Export template must contain exactly two scripts.");
const snapshotScript = scripts.find((match) =>
  new RegExp(`\\bid=["']${snapshotElementID}["']`, "u").test(match[1]),
);
assert(
  snapshotScript
    && /\btype=["']application\/json["']/u.test(snapshotScript[1])
    && !/\bsrc=/u.test(snapshotScript[1])
    && snapshotScript[2].trim() === marker,
  "Snapshot JSON must be the only non-external script payload.",
);
const runtimeScript = scripts.find((match) =>
  new RegExp(`\\bid=["']${runtimeElementID}["']`, "u").test(match[1]),
);
assert(
  runtimeScript
    && runtimeScript[2].trim() === ""
    && /\bsrc=["'][^"']+\/runtime\.js["']/u.test(runtimeScript[1])
    && /\bdefer\b/u.test(runtimeScript[1]),
  "Export runtime must be an external deferred script without inline code.",
);
assert(
  scripts.every((match) => match === snapshotScript || /\bsrc=/u.test(match[1])),
  "Export template contains executable inline JavaScript.",
);
assert(
  /<link\b[^>]+href=["'][^"']+\/runtime\.css["'][^>]*>/iu.test(html),
  "Export template is missing its external stylesheet.",
);
assert(
  !html.includes("cdn.jsdelivr.net")
    && !html.includes("'sha256-")
    && !/script-src[^;]*'unsafe-inline'/u.test(html),
  "Export template still depends on inline or third-party CDN assets.",
);
assert(
  Buffer.byteLength(html) <= 256 * 1024,
  "Export template exceeds 256 KiB.",
);
assert(
  html.split(assetOriginMarker).length - 1 === 5,
  "Export template must defer exactly five asset-origin references to Platform.",
);

const externalAssets = [
  ...html.matchAll(
    /<(?:script|link)\b[^>]+(?:src|href)=["']([^"']+)["'][^>]*>/giu,
  ),
];
assert(
  externalAssets.length === 2,
  "Export template must request one stylesheet and one runtime script.",
);
for (const match of externalAssets) {
  const tag = match[0];
  const url = match[1];
  assert(
    url.startsWith(`${assetOriginMarker}${publicAssetSetPath}/`),
    "Export template references an asset outside its immutable asset set.",
  );
  const relativePath = url.slice(
    assetOriginMarker.length + publicAssetSetPath.length + 1,
  );
  const file = manifest.files.find((candidate) => candidate.path === relativePath);
  assert(file, `Export template asset ${relativePath} is absent from the manifest.`);
  assert(
    tag.includes(`integrity="${file.integrity}"`)
      && /\bcrossorigin=["']anonymous["']/u.test(tag),
    `Export template asset ${relativePath} is missing SRI or anonymous CORS.`,
  );
}

assert(
  vendorAssets.echarts.version === packageJson.dependencies.echarts
    && vendorAssets.mermaid.version === packageJson.dependencies.mermaid,
  "Diagram asset versions do not match package.json.",
);
for (const [key, filename] of [
  ["echarts", "echarts.min.js"],
  ["mermaid", "mermaid.min.js"],
]) {
  const file = manifest.files.find((candidate) => candidate.path === filename);
  assert(
    file && file.integrity === vendorAssets[key].integrity,
    `${key} asset is missing or does not match its pinned integrity.`,
  );
}

const auditedSources = [
  "src/export/index.tsx",
  "src/export/ConversationExportDocument.tsx",
  "src/export/conversationCopyText.ts",
  "src/export/DiagramPlaceholder.tsx",
  "src/export/StaticMarkdownCode.tsx",
  "src/export/SanitizedMarkup.tsx",
  "src/export/StaticECharts.tsx",
  "src/export/StaticMermaid.tsx",
  "src/export/cdnAssets.ts",
  "src/export/loadCdnScript.ts",
  "src/export/conversationSnapshot.ts",
  "src/shared/i18n/conversationExport.ts",
  "src/shared/ui/ConversationMarkdown.tsx",
];
let rawMarkupBoundaries = 0;
for (const relativePath of auditedSources) {
  const source = fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
  assert(
    !/\b(?:fetch|XMLHttpRequest|WebSocket|EventSource)\b/u.test(source),
    `${relativePath} contains a network API.`,
  );
  assert(
    !/shared\/(?:data\/(?:api|auth|desktop)|config\/runtimeConfig)|src\/app|src\/features/u.test(
      source,
    ),
    `${relativePath} crosses the export boundary.`,
  );
  const rawMarkupMatches = source.match(/dangerouslySetInnerHTML/gu) || [];
  rawMarkupBoundaries += rawMarkupMatches.length;
  if (rawMarkupMatches.length > 0) {
    assert(
      relativePath === "src/export/SanitizedMarkup.tsx",
      `${relativePath} bypasses the centralized sanitizer.`,
    );
  }
}
assert(rawMarkupBoundaries === 1, "Export runtime must have one raw-markup boundary.");

const configuredPlatformArtifact = String(
  process.env.CONVERSATION_EXPORT_PLATFORM_ARTIFACT || "",
).trim();
const platformArtifactPath = configuredPlatformArtifact
  ? path.resolve(configuredPlatformArtifact)
  : path.resolve(
      repoRoot,
      "../agent-platform/scripts/release-assets/conversation-export/conversation.template.html",
    );
if (configuredPlatformArtifact || fs.existsSync(platformArtifactPath)) {
  assert(
    fs.existsSync(platformArtifactPath)
      && fs.readFileSync(templatePath).equals(fs.readFileSync(platformArtifactPath)),
    "Agent Platform vendored conversation template is out of sync.",
  );
}

const configuredTunnelRoot = String(
  process.env.CONVERSATION_EXPORT_TUNNEL_ASSET_ROOT || "",
).trim();
const tunnelAssetRoot = configuredTunnelRoot
  ? path.resolve(configuredTunnelRoot)
  : path.resolve(
      repoRoot,
      `../tunnel-hub-server/internal/shareassets/files/${manifest.assetSet}`,
    );
const tunnelFilesRoot = path.dirname(tunnelAssetRoot);
if (configuredTunnelRoot || fs.existsSync(tunnelFilesRoot)) {
  assert(fs.existsSync(tunnelAssetRoot), "Tunnel conversation asset set is missing.");
  for (const relativePath of manifestFiles) {
    assert(
      fs.readFileSync(path.join(assetRoot, ...relativePath.split("/"))).equals(
        fs.readFileSync(path.join(tunnelAssetRoot, ...relativePath.split("/"))),
      ),
      `Tunnel conversation asset ${relativePath} is out of sync.`,
    );
  }
}

console.log("Conversation export template and immutable assets are valid.");
