#!/usr/bin/env node

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "..");
const vendoredPath = path.join(
  repoRoot,
  "src/shared/contracts/generated/agentWebclientBridge.ts",
);
const configuredDesktopMirror = process.env.AGENT_WEBCLIENT_CONTRACT_PATH;
const desktopMirrorPath = configuredDesktopMirror
  ? path.resolve(configuredDesktopMirror)
  : path.resolve(
      repoRoot,
      "../zenmind-desktop/contracts/agent-webclient/agent-webclient-bridge.ts",
    );

const normalizeContractText = (value) => value.replace(/\r\n/gu, "\n");
const vendored = normalizeContractText(fs.readFileSync(vendoredPath, "utf8"));
const expectedMirrorHash = "6ce8f8f7474bd2a72d5cdafed66b0162b0f195a7044c369f1270396ecf336ae1";
const actualHash = crypto.createHash("sha256").update(vendored).digest("hex");

if (actualHash !== expectedMirrorHash) {
  console.error(
    `Vendored Agent WebClient contract hash mismatch: expected ${expectedMirrorHash}, got ${actualHash}`,
  );
  process.exit(1);
}

if (fs.existsSync(desktopMirrorPath)) {
  const desktopMirror = normalizeContractText(fs.readFileSync(desktopMirrorPath, "utf8"));
  if (desktopMirror !== vendored) {
    console.error(`Vendored contract differs from Desktop mirror: ${desktopMirrorPath}`);
    process.exit(1);
  }
}

console.log(`Agent WebClient bridge contract mirror is synchronized (${actualHash}).`);
