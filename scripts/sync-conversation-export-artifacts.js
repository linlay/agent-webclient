#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "..");
const exportRoot = path.join(repoRoot, "dist/export");
const templateSource = path.join(exportRoot, "conversation.template.html");
const manifest = JSON.parse(
  fs.readFileSync(path.join(exportRoot, "conversation-assets.json"), "utf8"),
);
const assetSource = path.join(
  exportRoot,
  "assets",
  manifest.assetSet,
);
const platformTemplate = path.resolve(
  repoRoot,
  "../agent-platform/scripts/release-assets/conversation-export/conversation.template.html",
);
const tunnelAssetRoot = path.resolve(
  repoRoot,
  `../tunnel-hub-server/internal/shareassets/files/${manifest.assetSet}`,
);
const checkOnly = process.argv.includes("--check");

function assertFile(pathname, message) {
  if (!fs.statSync(pathname, { throwIfNoEntry: false })?.isFile()) {
    throw new Error(message);
  }
}

function filesUnder(root, current = root) {
  return fs.readdirSync(current, { withFileTypes: true }).flatMap((entry) => {
    const absolute = path.join(current, entry.name);
    if (entry.isDirectory()) return filesUnder(root, absolute);
    if (!entry.isFile()) return [];
    return [path.relative(root, absolute)];
  });
}

assertFile(templateSource, "Build the conversation export template first.");
if (!fs.statSync(assetSource, { throwIfNoEntry: false })?.isDirectory()) {
  throw new Error("Build the conversation export asset set first.");
}

if (checkOnly) {
  assertFile(platformTemplate, "Platform conversation export template is missing.");
  if (!fs.readFileSync(templateSource).equals(fs.readFileSync(platformTemplate))) {
    throw new Error("Platform conversation export template is out of sync.");
  }
} else {
  fs.mkdirSync(path.dirname(platformTemplate), { recursive: true });
  fs.copyFileSync(templateSource, platformTemplate);
}

if (fs.existsSync(tunnelAssetRoot)) {
  const sourceFiles = filesUnder(assetSource).sort();
  const destinationFiles = filesUnder(tunnelAssetRoot).sort();
  if (JSON.stringify(sourceFiles) !== JSON.stringify(destinationFiles)) {
    throw new Error("Existing Tunnel asset set does not exactly match the build output.");
  }
  for (const relativePath of sourceFiles) {
    const source = path.join(assetSource, relativePath);
    const destination = path.join(tunnelAssetRoot, relativePath);
    assertFile(destination, `Existing Tunnel asset set is incomplete: ${relativePath}`);
    if (!fs.readFileSync(source).equals(fs.readFileSync(destination))) {
      throw new Error(
        `Refusing to overwrite immutable Tunnel asset: ${relativePath}`,
      );
    }
  }
} else if (checkOnly) {
  throw new Error("Current conversation export asset set is missing from Tunnel.");
} else {
  fs.mkdirSync(path.dirname(tunnelAssetRoot), { recursive: true });
  fs.cpSync(assetSource, tunnelAssetRoot, { recursive: true, errorOnExist: true });
}

console.log(
  `${checkOnly ? "Verified" : "Synced"} conversation export asset set ${manifest.assetSet}.`,
);
