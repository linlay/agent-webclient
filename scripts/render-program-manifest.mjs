#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const options = new Map();
for (let index = 2; index < process.argv.length; index += 2) {
  const key = process.argv[index];
  const value = process.argv[index + 1];
  if (!key?.startsWith("--") || value === undefined) {
    throw new Error("arguments must be --name value pairs");
  }
  options.set(key.slice(2), value);
}
for (const key of ["template", "output", "version", "os", "arch", "asset"]) {
  if (!options.get(key)) throw new Error(`missing --${key}`);
}
const targetOS = options.get("os");
const targetArch = options.get("arch");
if (!["darwin", "linux", "windows"].includes(targetOS)) throw new Error(`invalid target OS: ${targetOS}`);
if (!["amd64", "arm64"].includes(targetArch)) throw new Error(`invalid target arch: ${targetArch}`);
const windows = targetOS === "windows";
const replacements = {
  __VERSION__: options.get("version"),
  __TARGET_OS__: targetOS,
  __TARGET_ARCH__: targetArch,
  __START_SCRIPT__: windows ? "start.ps1" : "start.sh",
  __STOP_SCRIPT__: windows ? "stop.ps1" : "stop.sh",
  __DEPLOY_SCRIPT__: windows ? "deploy.ps1" : "deploy.sh",
  __PROGRAM_COMMON__: windows ? "scripts/program-common.ps1" : "scripts/program-common.sh",
  __ASSET_FILENAME__: options.get("asset")
};
let payload = fs.readFileSync(options.get("template"), "utf8");
for (const [placeholder, value] of Object.entries(replacements)) {
  payload = payload.replaceAll(placeholder, value);
}
if (/__[A-Z0-9_]+__/u.test(payload)) throw new Error("manifest contains an unresolved placeholder");
const manifest = JSON.parse(payload);
if (manifest.platform.os !== targetOS || manifest.platform.arch !== targetArch) {
  throw new Error("rendered manifest platform mismatch");
}
if (!Array.isArray(manifest.runtime.requiredPaths) || manifest.runtime.requiredPaths.length === 0) {
  throw new Error("rendered manifest requiredPaths are missing");
}
const proxyRoutes = manifest.desktop?.hosting?.proxyRoutes;
if (!Array.isArray(proxyRoutes)) {
  throw new Error("rendered manifest Desktop proxyRoutes are missing");
}
if (proxyRoutes.some((route) => route.path === "/auth" || route.path === "/ws")) {
  throw new Error("Desktop Frame Port manifest must not expose /auth or /ws");
}
const apiRoute = proxyRoutes.find((route) => route.match === "prefix" && route.path === "/api");
if (
  !apiRoute ||
  apiRoute.targetEnv !== "BASE_URL" ||
  apiRoute.auth !== "agent-platform-access-token" ||
  apiRoute.http !== true ||
  apiRoute.websocket === true ||
  (Array.isArray(apiRoute.ssePaths) && apiRoute.ssePaths.length > 0)
) {
  throw new Error("Desktop Frame Port manifest requires an authenticated HTTP-only /api route");
}
fs.mkdirSync(path.dirname(options.get("output")), { recursive: true });
fs.writeFileSync(options.get("output"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
