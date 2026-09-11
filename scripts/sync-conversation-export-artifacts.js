#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "..");
const exportRoot = path.join(repoRoot, "dist/export");
const manifestPath = path.join(exportRoot, "conversation-assets.json");
const templatePath = path.join(exportRoot, "conversation.template.html");
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
const assetSource = path.join(exportRoot, "assets", manifest.assetSet);
const tunnelRoot = path.resolve(repoRoot, "../tunnel-hub-server/internal/shareassets");
const tunnelFilesRoot = path.join(tunnelRoot, "files");
const tunnelAssetRoot = path.join(tunnelFilesRoot, manifest.assetSet);
const tunnelManifestPath = path.join(tunnelRoot, "conversation-assets.json");
const tunnelTemplatePath = path.join(tunnelRoot, "conversation.template.html");
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

function assertSameFile(source, destination, message) {
  assertFile(destination, message);
  if (!fs.readFileSync(source).equals(fs.readFileSync(destination))) {
    throw new Error(message);
  }
}

assertFile(templatePath, "Build the conversation export template first.");
if (!fs.statSync(assetSource, { throwIfNoEntry: false })?.isDirectory()) {
  throw new Error("Build the conversation export asset set first.");
}

if (checkOnly) {
  const publishedSets = fs.readdirSync(tunnelFilesRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  if (JSON.stringify(publishedSets) !== JSON.stringify([manifest.assetSet])) {
    throw new Error("Tunnel must contain exactly the current conversation export asset set.");
  }
  const sourceFiles = filesUnder(assetSource).sort();
  const destinationFiles = filesUnder(tunnelAssetRoot).sort();
  if (JSON.stringify(sourceFiles) !== JSON.stringify(destinationFiles)) {
    throw new Error("Tunnel conversation export assets are incomplete.");
  }
  for (const relativePath of sourceFiles) {
    assertSameFile(
      path.join(assetSource, relativePath),
      path.join(tunnelAssetRoot, relativePath),
      `Tunnel conversation export asset is out of sync: ${relativePath}`,
    );
  }
  assertSameFile(manifestPath, tunnelManifestPath, "Tunnel conversation export manifest is out of sync.");
  assertSameFile(templatePath, tunnelTemplatePath, "Tunnel conversation export template is out of sync.");
} else {
  fs.rmSync(tunnelFilesRoot, { recursive: true, force: true });
  fs.mkdirSync(tunnelFilesRoot, { recursive: true });
  fs.cpSync(assetSource, tunnelAssetRoot, { recursive: true });
  fs.copyFileSync(manifestPath, tunnelManifestPath);
  fs.copyFileSync(templatePath, tunnelTemplatePath);
}

console.log(
  `${checkOnly ? "Verified" : "Published"} conversation export renderer ${manifest.assetSet}.`,
);
