#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "..");
const sourceRoot = path.join(repoRoot, "src");
const featuresRoot = path.join(sourceRoot, "features");
const sharedRoot = path.join(sourceRoot, "shared");
const pagesRoot = path.join(sourceRoot, "app", "pages");
const importPattern = /(?:from\s+|import\s*\(|require\s*\(|jest\.mock\s*\()\s*["']([^"']+)["']/g;

function walk(directory) {
  if (!fs.existsSync(directory)) return [];
  const files = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...walk(target));
    else if (/\.(?:ts|tsx)$/.test(entry.name)) files.push(target);
  }
  return files;
}

function readImports(source) {
  return Array.from(source.matchAll(importPattern), (match) => match[1]);
}

function isTestFile(file) {
  return /\.(?:test|spec)\.(?:ts|tsx)$/.test(file);
}

function importedFeature(importedPath) {
  const match = importedPath.match(/^@\/features\/([^/]+)(?:\/|$)/);
  return match ? match[1] : "";
}

const violations = [];
const featureNames = fs.existsSync(featuresRoot)
  ? fs.readdirSync(featuresRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort()
  : [];
const featureGraph = new Map(featureNames.map((name) => [name, new Set()]));

for (const feature of featureNames) {
  for (const file of walk(path.join(featuresRoot, feature))) {
    const relativeFile = path.relative(repoRoot, file);
    const imports = readImports(fs.readFileSync(file, "utf8"));
    for (const importedPath of imports) {
      if (
        importedPath.startsWith("@/app/pages/") ||
        importedPath.startsWith("@/app/modals/") ||
        importedPath.startsWith("@/app/layout/")
      ) {
        violations.push(`${relativeFile}: feature must not import ${importedPath}`);
      }
      if (feature === "events" && importedPath === "react") {
        violations.push(`${relativeFile}: events must not import React`);
      }
      const dependency = importedFeature(importedPath);
      if (feature === "transport" && dependency && dependency !== "transport") {
        violations.push(`${relativeFile}: transport must not import business feature ${dependency}`);
      }
      if (!isTestFile(file) && dependency && dependency !== feature) {
        featureGraph.get(feature).add(dependency);
      }
    }
  }
}

for (const file of walk(sharedRoot)) {
  const relativeFile = path.relative(repoRoot, file);
  for (const importedPath of readImports(fs.readFileSync(file, "utf8"))) {
    if (importedPath.startsWith("@/app/") || importedPath.startsWith("@/features/")) {
      violations.push(`${relativeFile}: shared must not import ${importedPath}`);
    }
  }
}

for (const file of walk(pagesRoot)) {
  const relativeFile = path.relative(repoRoot, file);
  for (const importedPath of readImports(fs.readFileSync(file, "utf8"))) {
    if (importedPath.startsWith("@/shared/data")) {
      violations.push(`${relativeFile}: app page must not import ${importedPath}`);
    }
  }
}

// Tarjan SCC: any multi-feature strongly connected component is a boundary failure.
let nextIndex = 0;
const indices = new Map();
const lowLinks = new Map();
const stack = [];
const onStack = new Set();

function visitFeature(feature) {
  indices.set(feature, nextIndex);
  lowLinks.set(feature, nextIndex);
  nextIndex += 1;
  stack.push(feature);
  onStack.add(feature);

  for (const dependency of featureGraph.get(feature) || []) {
    if (!featureGraph.has(dependency)) continue;
    if (!indices.has(dependency)) {
      visitFeature(dependency);
      lowLinks.set(feature, Math.min(lowLinks.get(feature), lowLinks.get(dependency)));
    } else if (onStack.has(dependency)) {
      lowLinks.set(feature, Math.min(lowLinks.get(feature), indices.get(dependency)));
    }
  }

  if (lowLinks.get(feature) !== indices.get(feature)) return;
  const component = [];
  while (stack.length > 0) {
    const member = stack.pop();
    onStack.delete(member);
    component.push(member);
    if (member === feature) break;
  }
  if (component.length > 1) {
    const members = new Set(component);
    const internalEdges = component.flatMap((member) =>
      Array.from(featureGraph.get(member) || [])
        .filter((dependency) => members.has(dependency))
        .map((dependency) => `${member} -> ${dependency}`),
    ).sort();
    violations.push(
      `feature cycle detected: ${component.sort().join(" <-> ")}\n  ${internalEdges.join("\n  ")}`,
    );
  }
}

for (const feature of featureNames) {
  if (!indices.has(feature)) visitFeature(feature);
}

const realtimePrimitivePaths = [
  "@/features/transport/lib/wsClientSingleton",
  "@/features/terminal/lib/terminalTransport",
  "@/features/terminal/lib/terminalRemoteSession",
];
const desktopForbiddenTransportPaths = [
  "@/features/transport/lib/standaloneRealtimeTransport",
  "@/features/transport/lib/standaloneTerminalTransport",
  "@/features/transport/lib/standaloneWsClient",
];
for (const file of walk(sourceRoot).filter((candidate) => !isTestFile(candidate))) {
  const relativeFile = path.relative(repoRoot, file);
  const isTransport = relativeFile.startsWith("src/features/transport/");
  const isDesktopTransport = isTransport && /^desktop[^/]*\.(?:ts|tsx)$/iu.test(path.basename(file));
  for (const importedPath of readImports(fs.readFileSync(file, "utf8"))) {
    if (isDesktopTransport && desktopForbiddenTransportPaths.includes(importedPath)) {
      violations.push(`${relativeFile}: Desktop transport must not import ${importedPath}`);
    }
    if (!isTransport && realtimePrimitivePaths.includes(importedPath)) {
      violations.push(`${relativeFile}: business code must use RealtimeTransport instead of ${importedPath}`);
    }
  }
}

if (violations.length > 0) {
  console.error("Feature boundary violations:\n" + violations.join("\n"));
  process.exit(1);
}

console.log(`Feature boundaries are valid (${featureNames.length} features, 0 cycles).`);
