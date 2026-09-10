import JSZip from "jszip";
import { parseSkinPackageManifest, SKIN_PACKAGE_LIMITS, validateSkinResourcePath, type SkinPackageManifest } from "@/shared/styles/appearance/skinPackage";

export type InstalledSkin = { manifest: SkinPackageManifest; images: Record<string, Blob> };
export type AppearanceAssets = { background: Blob | null; backgroundName: string; packages: InstalledSkin[] };
export const emptyAssets = (): AppearanceAssets => ({ background: null, backgroundName: "", packages: [] });
export function normalizeAppearanceAssets(value: unknown): AppearanceAssets {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("storage");
  const data = value as AppearanceAssets;
  if (!Array.isArray(data.packages) || data.packages.length > 20 ||
      (data.background !== null && !(data.background instanceof Blob)) || typeof data.backgroundName !== "string") throw new Error("storage");
  const packages = data.packages.flatMap((entry) => {
    try {
      const manifest = parseSkinPackageManifest(entry.manifest);
      const images: Record<string, Blob> = {};
      for (const path of [manifest.preview, manifest.variants.light.background?.path, manifest.variants.dark.background?.path]) {
        if (!path) continue;
        const image = entry.images?.[path];
        if (!(image instanceof Blob) || !["image/png", "image/jpeg"].includes(image.type) || image.size > SKIN_PACKAGE_LIMITS.fileBytes) throw new Error("storage");
        images[path] = image;
      }
      return [{ manifest, images }];
    } catch { return []; }
  });
  const background = data.background && ["image/png", "image/jpeg"].includes(data.background.type) && data.background.size <= SKIN_PACKAGE_LIMITS.fileBytes ? data.background : null;
  return { background, backgroundName: background ? data.backgroundName.slice(0, 180) : "", packages };
}

const DATABASE = "agent-webclient.appearance.v1";

// Blobs stay in a dedicated browser database. Host assets never enter this store.
export async function appearanceAssetStore(value?: AppearanceAssets): Promise<AppearanceAssets> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE, 1);
    request.onupgradeneeded = () => request.result.createObjectStore("assets");
    request.onerror = () => reject(new Error("storage"));
    request.onblocked = () => reject(new Error("storage"));
    request.onsuccess = () => {
      const db = request.result;
      const transaction = db.transaction("assets", value ? "readwrite" : "readonly");
      const operation = value ? transaction.objectStore("assets").put(value, "current") : transaction.objectStore("assets").get("current");
      transaction.oncomplete = () => { db.close(); resolve(value ?? operation.result ?? emptyAssets()); };
      transaction.onabort = transaction.onerror = () => { db.close(); reject(new Error("storage")); };
    };
  });
}

export async function validateBackground(blob: Blob): Promise<Blob> {
  if (blob.size > 16 * 1024 * 1024 || blob.size < 8) throw new Error("image");
  const buffer = await blob.arrayBuffer();
  const head = new Uint8Array(buffer);
  const png = [137, 80, 78, 71, 13, 10, 26, 10].every((byte, i) => head[i] === byte);
  const jpeg = head[0] === 255 && head[1] === 216 && head[2] === 255;
  if (!png && !jpeg) throw new Error("image");
  // Read dimensions before asking the browser to allocate a decoded bitmap.
  const view = new DataView(buffer);
  let width = 0, height = 0;
  if (png && buffer.byteLength >= 24 && view.getUint32(12) === 0x49484452) {
    width = view.getUint32(16); height = view.getUint32(20);
  } else if (jpeg) {
    let offset = 2;
    while (offset + 8 < buffer.byteLength) {
      if (head[offset++] !== 255) break;
      while (head[offset] === 255) offset++;
      const marker = head[offset++];
      if ([0xd9, 0xda].includes(marker)) break;
      if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
      if (offset + 2 > buffer.byteLength) break;
      const length = view.getUint16(offset);
      if (length < 2 || offset + length > buffer.byteLength) break;
      if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker) && length >= 8) {
        height = view.getUint16(offset + 3); width = view.getUint16(offset + 5); break;
      }
      offset += length;
    }
  }
  if (!width || !height || width > 8192 || height > 8192 || width * height > 24_000_000) throw new Error("image");
  const image = new Blob([blob], { type: png ? "image/png" : "image/jpeg" });
  const url = URL.createObjectURL(image);
  try {
    await new Promise<void>((resolve, reject) => {
      const img = new Image();
      const timer = setTimeout(() => { img.src = ""; reject(new Error("image")); }, 5000);
      img.onload = () => {
        clearTimeout(timer);
        if (img.naturalWidth < 1 || img.naturalHeight < 1 || img.naturalWidth > 8192 || img.naturalHeight > 8192 || img.naturalWidth * img.naturalHeight > 24_000_000) reject(new Error("image"));
        else resolve();
      };
      img.onerror = () => { clearTimeout(timer); reject(new Error("image")); };
      img.src = url;
    });
  } finally { URL.revokeObjectURL(url); }
  return image;
}

// Check the central directory before JSZip decompresses anything. Reject ZIP64,
// encrypted archives, links, duplicate/ambiguous paths and expanded size bombs.
export function inspectSkinZip(buffer: ArrayBuffer) {
  if (buffer.byteLength > SKIN_PACKAGE_LIMITS.archiveBytes) throw new Error("package");
  const view = new DataView(buffer);
  let end = buffer.byteLength - 22;
  while (end >= Math.max(0, buffer.byteLength - 65557) && view.getUint32(end, true) !== 0x06054b50) end--;
  if (end < 0 || end < buffer.byteLength - 65557 || end + 22 + view.getUint16(end + 20, true) !== buffer.byteLength ||
      view.getUint16(end + 4, true) !== 0 || view.getUint16(end + 6, true) !== 0) throw new Error("package");
  const count = view.getUint16(end + 10, true);
  let cursor = view.getUint32(end + 16, true), expanded = 0;
  if (!count || count > SKIN_PACKAGE_LIMITS.entries || view.getUint16(end + 8, true) !== count || cursor + view.getUint32(end + 12, true) !== end) throw new Error("package");
  const paths = new Set<string>();
  const entries = new Map<string, number>();
  for (let i = 0; i < count; i++) {
    if (cursor + 46 > end || view.getUint32(cursor, true) !== 0x02014b50) throw new Error("package");
    const size = view.getUint32(cursor + 24, true), length = view.getUint16(cursor + 28, true);
    const next = cursor + 46 + length + view.getUint16(cursor + 30, true) + view.getUint16(cursor + 32, true);
    if (next > end || view.getUint16(cursor + 8, true) & 1 || ![0, 8].includes(view.getUint16(cursor + 10, true)) ||
        view.getUint16(cursor + 34, true) !== 0 || (view.getUint32(cursor + 38, true) >>> 16 & 0xf000) === 0xa000) throw new Error("package");
    const name = new TextDecoder("utf-8", { fatal: true }).decode(new Uint8Array(buffer, cursor + 46, length));
    let extra = cursor + 46 + length;
    const extraEnd = extra + view.getUint16(cursor + 30, true);
    while (extra + 4 <= extraEnd) {
      const tag = view.getUint16(extra, true), size = view.getUint16(extra + 2, true);
      if (tag === 0x0001 || extra + 4 + size > extraEnd) throw new Error("package");
      extra += 4 + size;
    }
    if (extra !== extraEnd) throw new Error("package");
    const path = validateSkinResourcePath(name.endsWith("/") ? name.slice(0, -1) : name);
    if (paths.has(path.toLowerCase())) throw new Error("package");
    paths.add(path.toLowerCase());
    expanded += size;
    if (size > SKIN_PACKAGE_LIMITS.fileBytes || expanded > SKIN_PACKAGE_LIMITS.expandedBytes ||
        (path === "skin.json" && size > SKIN_PACKAGE_LIMITS.manifestBytes)) throw new Error("package");
    if (!name.endsWith("/")) {
      if (path !== "skin.json" && !/\.(png|jpe?g)$/i.test(path)) throw new Error("package");
      entries.set(path, size);
    }
    cursor = next;
  }
  if (cursor !== end || !entries.has("skin.json")) throw new Error("package");
  return entries;
}

export async function importSkinArchive(file: File): Promise<InstalledSkin> {
  if (file.size > SKIN_PACKAGE_LIMITS.archiveBytes) throw new Error("package");
  const buffer = await file.arrayBuffer();
  const entries = inspectSkinZip(buffer);
  const zip = await JSZip.loadAsync(buffer);
  async function bytes(path: string) {
    const entry = zip.file(path);
    if (!entry || !entries.has(path)) throw new Error("package");
    return new Promise<Uint8Array>((resolve, reject) => {
      // JSZip 3.10.1 exposes this bounded stream on JSZipObject; its .d.ts only
      // describes the archive stream. Keep the runtime guard for future upgrades.
      const fileStream = entry as unknown as { internalStream(type: "uint8array"): JSZip.JSZipStreamHelper<Uint8Array> };
      if (typeof fileStream.internalStream !== "function") { reject(new Error("package")); return; }
      const stream = fileStream.internalStream("uint8array");
      const chunks: Uint8Array[] = [];
      let size = 0;
      stream.on("data", (chunk) => {
        size += chunk.byteLength;
        if (size > entries.get(path)!) { stream.pause(); reject(new Error("package")); return; }
        chunks.push(chunk);
      });
      stream.on("error", () => reject(new Error("package")));
      stream.on("end", () => {
        if (size !== entries.get(path)) { reject(new Error("package")); return; }
        const data = new Uint8Array(size);
        let offset = 0;
        for (const chunk of chunks) { data.set(chunk, offset); offset += chunk.byteLength; }
        resolve(data);
      });
      stream.resume();
    });
  }
  const manifest = parseSkinPackageManifest(JSON.parse(new TextDecoder().decode(await bytes("skin.json"))));
  const paths = new Set([manifest.preview, manifest.variants.light.background?.path, manifest.variants.dark.background?.path].filter((p): p is string => Boolean(p)));
  const images: Record<string, Blob> = {};
  for (const path of paths) images[path] = await validateBackground(new Blob([await bytes(path) as Uint8Array<ArrayBuffer>]));
  return { manifest, images };
}
