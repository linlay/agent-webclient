#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "..");
const shareJsRoot = path.join(repoRoot, "dist", "share", "js");
const sharedJsRoot = path.join(repoRoot, "dist", "js");
const forbiddenSources = [
  "./src/app/",
  "./src/features/",
  "./src/shared/data/auth/",
  "./src/shared/data/desktop/",
];
const requiredSources = [
  "./src/shared/ui/ConversationMarkdown.tsx",
  "./src/shared/ui/markdown-code/ConversationMarkdownCode.tsx",
  "./src/shared/ui/markdown-code/MarkdownECharts.tsx",
  "./src/shared/ui/markdown-code/MarkdownMermaid.tsx",
];
const MAX_SOURCELESS_WRAPPER_BYTES = 512;

if (!fs.existsSync(shareJsRoot) || !fs.existsSync(sharedJsRoot)) {
  throw new Error("Share bundle is missing. Run the production build first.");
}

const shareEntries = fs.readdirSync(shareJsRoot)
  .filter((file) => /^share\.[^.]+\.js$/u.test(file))
  .map((file) => path.join(shareJsRoot, file));
if (shareEntries.length !== 1) {
  throw new Error(`Expected one share entry, found ${shareEntries.length}.`);
}

const reachableScripts = new Set(shareEntries);
const pendingScripts = [...shareEntries];
while (pendingScripts.length > 0) {
  const script = pendingScripts.pop();
  const source = fs.readFileSync(script, "utf8");
  const chunkIds = Array.from(source.matchAll(/\.e\((\d+)\)/gu), (match) => match[1]);
  for (const chunkId of chunkIds) {
    const chunkPattern = new RegExp(`^${chunkId}\\.[^.]+(?:\\.chunk)?\\.js$`, "u");
    const chunkFile = fs.readdirSync(sharedJsRoot).find((file) => chunkPattern.test(file));
    if (!chunkFile) throw new Error(`Share chunk ${chunkId} is missing.`);
    const chunkPath = path.join(sharedJsRoot, chunkFile);
    if (!reachableScripts.has(chunkPath)) {
      reachableScripts.add(chunkPath);
      pendingScripts.push(chunkPath);
    }
  }
}

const scriptsWithoutMaps = Array.from(reachableScripts)
  .filter((script) => !fs.existsSync(`${script}.map`));
const unsafeSourcelessScripts = scriptsWithoutMaps.filter((script) => {
  const source = fs.readFileSync(script, "utf8");
  return Buffer.byteLength(source) > MAX_SOURCELESS_WRAPPER_BYTES
    || source.includes("src/")
    || source.includes("sourceMappingURL");
});
if (unsafeSourcelessScripts.length > 0) {
  throw new Error(
    `Unverifiable share chunks are missing source maps:\n${unsafeSourcelessScripts.join("\n")}`,
  );
}
const mapFiles = Array.from(reachableScripts, (script) => `${script}.map`)
  .filter((file) => fs.existsSync(file));
const sources = mapFiles.flatMap((file) => {
  const sourceMap = JSON.parse(fs.readFileSync(file, "utf8"));
  return Array.isArray(sourceMap.sources) ? sourceMap.sources : [];
});
const violations = sources.filter((source) =>
  forbiddenSources.some((prefix) => source.includes(prefix))
);
const missing = requiredSources.filter((required) =>
  !sources.some((source) => source.includes(required))
);

if (violations.length > 0 || missing.length > 0) {
  if (violations.length > 0) {
    console.error(`Forbidden share dependencies:\n${violations.join("\n")}`);
  }
  if (missing.length > 0) {
    console.error(`Missing shared renderers:\n${missing.join("\n")}`);
  }
  process.exit(1);
}

console.log(
  `Share bundle dependencies are valid across ${reachableScripts.size} chunks`
  + ` (${scriptsWithoutMaps.length} generated wrappers checked).`,
);
