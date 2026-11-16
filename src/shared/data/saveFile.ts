import { isDesktopAppMode } from "@/shared/utils/routing";
import { t } from "@/shared/i18n";
import { DESKTOP_FILE_SAVE_GLOBAL, DESKTOP_FILE_SAVE_CHUNK_BYTES,
  type DesktopFileSaveBridge, type DesktopFileSaveResult } from "@/shared/contracts/generated/agentWebclientBridge";

export type SaveFileOutcome = { status: "saved" | "canceled" | "started" };
type Options = { filename: string; signal?: AbortSignal };

function bridge(): DesktopFileSaveBridge {
  const host = (window as unknown as Record<string, unknown>)[DESKTOP_FILE_SAVE_GLOBAL] as DesktopFileSaveBridge | undefined;
  if (!host || host.version !== 1 || typeof host.request !== "function") throw new Error(t("api.saveUpgradeRequired"));
  return host;
}
function filename(value: string) {
  const safe = value.trim().replace(/[<>:"/\\|?*\u0000-\u001F]/gu, "_").slice(0, 180);
  if (!safe) throw new Error(t("api.saveInvalidFilename"));
  return safe;
}
function browserDownload(blob: Blob, name: string): SaveFileOutcome {
  if (typeof document === "undefined" || typeof URL?.createObjectURL !== "function") throw new Error(t("api.fileDownloadUnsupported"));
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = objectUrl; anchor.download = name; anchor.rel = "noopener";
  document.body.appendChild(anchor); anchor.click(); document.body.removeChild(anchor);
  setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
  return { status: "started" };
}
function assertResult(value: DesktopFileSaveResult) {
  if (!value || !["ready", "writing", "committing", "saved", "canceled", "failed"].includes(value.status)) throw new Error(t("api.saveResultUnknown"));
  if (value.status === "failed") throw new Error(t("api.saveFailed"));
  return value;
}
function encode(bytes: Uint8Array) {
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 8192) binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
  return btoa(binary);
}
async function saveChunks(source: AsyncIterable<Uint8Array>, options: Options, sizeBytes?: number): Promise<SaveFileOutcome> {
  if (options.signal?.aborted) return { status: "canceled" };
  const host = bridge();
  const taskId = crypto.randomUUID();
  const cancel = () => host.request({ operation: "cancel", taskId });
  const onAbort = () => { void cancel().catch(() => undefined); };
  options.signal?.addEventListener("abort", onAbort, { once: true });
  let committed = false;
  try {
    const begun = assertResult(await host.request({ operation: "begin", taskId, filename: filename(options.filename), sizeBytes }));
    if (begun.status === "canceled" || options.signal?.aborted) return { status: "canceled" };
    if (begun.status !== "writing") throw new Error(t("api.saveResultUnknown"));
    let sequence = 0;
    for await (const bytes of source) {
      // Split even if the source's network reader produces a larger buffer.
      for (let offset = 0; offset < bytes.length; offset += DESKTOP_FILE_SAVE_CHUNK_BYTES) {
        if (options.signal?.aborted) return { status: "canceled" };
        const result = assertResult(await host.request({ operation: "chunk", taskId, sequence: sequence++,
          dataBase64: encode(bytes.subarray(offset, offset + DESKTOP_FILE_SAVE_CHUNK_BYTES)) }));
        if (result.status === "canceled") return { status: "canceled" };
        if (result.status !== "writing") throw new Error(t("api.saveResultUnknown"));
      }
    }
    if (options.signal?.aborted) return { status: "canceled" };
    const result = assertResult(await host.request({ operation: "commit", taskId }));
    committed = result.status === "saved";
    if (result.status === "canceled" || committed) return { status: committed ? "saved" : "canceled" };
    throw new Error(t("api.saveResultUnknown"));
  } catch (error) {
    // An IPC rejection may arrive after commit. Reconcile before reporting failure.
    const result = await cancel().catch(() => null);
    if (result?.status === "saved") { committed = true; return { status: "saved" }; }
    if (!result || result.status === "committing") throw new Error(t("api.saveResultUnknown"));
    if (options.signal?.aborted) return { status: "canceled" };
    throw error;
  } finally {
    options.signal?.removeEventListener("abort", onAbort);
    if (!committed) await cancel().catch(() => undefined);
  }
}
export async function saveBlob(blob: Blob, options: Options): Promise<SaveFileOutcome> {
  const name = filename(options.filename);
  if (options.signal?.aborted) return { status: "canceled" };
  if (!isDesktopAppMode()) return browserDownload(blob, name);
  async function* chunks() {
    for (let offset = 0; offset < blob.size; offset += DESKTOP_FILE_SAVE_CHUNK_BYTES)
      yield new Uint8Array(await blob.slice(offset, offset + DESKTOP_FILE_SAVE_CHUNK_BYTES).arrayBuffer());
  }
  return saveChunks(chunks(), { ...options, filename: name }, blob.size);
}
export async function saveResponse(response: Response, options: Options): Promise<SaveFileOutcome> {
  if (!isDesktopAppMode() || !response.body) return saveBlob(await response.blob(), options);
  const reader = response.body.getReader();
  async function* chunks() {
    try {
      while (true) {
        const result = await reader.read();
        if (result.done) break;
        yield result.value;
      }
    } finally { await reader.cancel().catch(() => undefined); }
  }
  try {
    // Content-Length may describe compressed bytes; only use it for unencoded bodies.
    const rawSize = response.headers.get("content-length");
    const size = !response.headers.get("content-encoding") && rawSize && /^\d+$/.test(rawSize) ? Number(rawSize) : undefined;
    return await saveChunks(chunks(), options, Number.isSafeInteger(size) ? size : undefined);
  } finally { await reader.cancel().catch(() => undefined); reader.releaseLock(); }
}
