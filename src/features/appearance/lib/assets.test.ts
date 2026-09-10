import JSZip from "jszip";
import { inspectSkinZip, normalizeAppearanceAssets, validateBackground } from "./assets";
import { parseSkinPackageManifest, validateSkinResourcePath } from "@/shared/styles/appearance/skinPackage";
import { parseAgentWebclientAppearanceTokens } from "@/shared/contracts/generated/agentWebclientBridge";
const manifest = { schemaVersion: 1, id: "sample", name: "Sample", version: "1.0.0", variants: { light: { tokens: { "--accent": "#287653", "--control-radius": "10px" } }, dark: { tokens: { "--accent": "rgba(120, 210, 140, 1)" } } } };
it("shares Desktop v1 color/radius semantics", () => {
  const parsed = parseSkinPackageManifest(manifest);
  for (const variant of Object.values(parsed.variants)) expect(parseAgentWebclientAppearanceTokens(variant.tokens)).toEqual(variant.tokens);
});
it.each(["../skin.png", "assets/../image.jpg", "/tmp/a.png", "C:/a.png", "x\\a.png", "https://a.png", "assets/x.png?x", "assets/CON.png", "assets/a.png."])("rejects non-portable resource path %s", (path) => {
  expect(() => validateSkinResourcePath(path)).toThrow();
});
it("rejects arbitrary CSS and unsupported package versions", () => {
  expect(() => parseSkinPackageManifest({ ...manifest, schemaVersion: 2 })).toThrow();
  expect(() => parseSkinPackageManifest({ ...manifest, variants: { ...manifest.variants, light: { tokens: { "--accent": "var(--injected)" } } } })).toThrow();
});
it("checks ZIP directory size before decompression and rejects traversal, duplicates, scripts and expansion bombs", async () => {
  const valid = new JSZip(); valid.file("skin.json", JSON.stringify(manifest)); valid.file("assets/background.png", "fixture");
  const bytes = await valid.generateAsync({ type: "arraybuffer" });
  expect(inspectSkinZip(bytes).has("assets/background.png")).toBe(true);
  for (const name of ["../escape.png", "script.js", "SKIN.JSON"]) {
    const bad = new JSZip(); bad.file("skin.json", "{}"); bad.file(name, "bad");
    expect(() => inspectSkinZip(bytes)).not.toThrow();
    const buffer = await bad.generateAsync({ type: "arraybuffer" });
    expect(() => inspectSkinZip(buffer)).toThrow();
  }
  const bomb = bytes.slice(0); const view = new DataView(bomb);
  for (let i = 0; i < view.byteLength - 46; i++) if (view.getUint32(i, true) === 0x02014b50) { view.setUint32(i + 24, 100 * 1024 * 1024, true); break; }
  expect(() => inspectSkinZip(bomb)).toThrow();
  expect(() => inspectSkinZip(new ArrayBuffer(4))).toThrow();
});

it("drops unavailable packages and rejects corrupt storage records", () => {
  expect(() => normalizeAppearanceAssets({ packages: "bad" })).toThrow();
  expect(normalizeAppearanceAssets({ background: null, backgroundName: "", packages: [{ manifest: { schemaVersion: 3 } }] }).packages).toEqual([]);
});
it("rejects image headers with excessive dimensions before browser decoding", async () => {
  const bytes = new Uint8Array(32);
  bytes.set([137, 80, 78, 71, 13, 10, 26, 10]);
  const view = new DataView(bytes.buffer);
  view.setUint32(12, 0x49484452); view.setUint32(16, 16000); view.setUint32(20, 16000);
  await expect(validateBackground(new Blob([bytes]))).rejects.toThrow("image");
  await expect(validateBackground(new Blob(["<svg>not a raster</svg>"]))).rejects.toThrow("image");
});
