import {
  AGENT_WEBCLIENT_NATIVE_SHARE_CHUNK_BYTES,
  AGENT_WEBCLIENT_NATIVE_SHARE_MAX_BYTES,
  AGENT_WEBCLIENT_NATIVE_SHARE_MAX_FILES,
  AGENT_WEBCLIENT_NATIVE_SHARE_READ_REQUEST_TYPE,
  AGENT_WEBCLIENT_NATIVE_SHARE_READ_RESPONSE_TYPE,
  type AgentWebclientNativeShareFileDescriptor,
  type AgentWebclientNativeShareReadRequest,
  type AgentWebclientNativeShareReadResult,
  type AgentWebclientNativeShareTarget,
} from "@/shared/contracts/generated/agentWebclientBridge";
import {
  hasDesktopHostBridge,
  isDesktopHostMessageEvent,
  postDesktopHostMessage,
} from "@/shared/data/desktop/desktopHostBridge";

export type DesktopNativeShareTarget = AgentWebclientNativeShareTarget;

export function parseDesktopNativeShareTarget(pathname: string, search: string): DesktopNativeShareTarget | null {
  const match = /^\/agent\/([^/]+)$/u.exec(pathname);
  const params = new URLSearchParams(search);
  if (!match || params.has("chatId") || params.getAll("newChat").length !== 1 ||
      params.getAll("shareBatch").length !== 1) return null;
  const newChat = params.get("newChat") || "";
  const batchId = params.get("shareBatch") || "";
  if (!/^[1-9]\d{12}$/u.test(newChat) ||
      !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/u.test(batchId)) return null;
  try {
    const agentKey = decodeURIComponent(match[1]);
    if (!agentKey || /[/\\\u0000-\u001f\u007f]/u.test(agentKey)) return null;
    return { agentKey, newChat, batchId };
  } catch {
    return null;
  }
}

function abortError() {
  return new DOMException("The shared file import was cancelled", "AbortError");
}

export function readDesktopNativeShare(
  request: AgentWebclientNativeShareReadRequest,
  signal?: AbortSignal,
): Promise<AgentWebclientNativeShareReadResult> {
  if (!hasDesktopHostBridge()) return Promise.reject(new Error("Desktop sharing is unavailable"));
  if (signal?.aborted) return Promise.reject(abortError());
  return new Promise((resolve, reject) => {
    const requestId = `native_share_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
    const cleanup = () => {
      window.clearTimeout(timeoutId);
      window.removeEventListener("message", onMessage);
      signal?.removeEventListener("abort", onAbort);
    };
    const onAbort = () => { cleanup(); reject(abortError()); };
    const onMessage = (event: MessageEvent) => {
      if (!isDesktopHostMessageEvent(event)) return;
      const message = event.data;
      if (!message || message.type !== AGENT_WEBCLIENT_NATIVE_SHARE_READ_RESPONSE_TYPE ||
          message.requestId !== requestId) return;
      cleanup();
      const result = message.nativeShareResult;
      if (!result || typeof result !== "object" || typeof result.ok !== "boolean") {
        reject(new Error("Invalid Desktop sharing response"));
      } else if (!result.ok) {
        reject(new Error(typeof result.message === "string" ? result.message : "Unable to receive the shared files"));
      } else {
        resolve(result);
      }
    };
    const timeoutId = window.setTimeout(() => {
      cleanup();
      reject(new Error("Receiving the shared files timed out"));
    }, 10_000);
    window.addEventListener("message", onMessage);
    signal?.addEventListener("abort", onAbort, { once: true });
    if (!postDesktopHostMessage({ type: AGENT_WEBCLIENT_NATIVE_SHARE_READ_REQUEST_TYPE, requestId, nativeShareRequest: request })) {
      cleanup();
      reject(new Error("Desktop sharing is unavailable"));
    }
  });
}

function parseSharedFiles(value: unknown): AgentWebclientNativeShareFileDescriptor[] {
  if (!Array.isArray(value) || !value.length || value.length > AGENT_WEBCLIENT_NATIVE_SHARE_MAX_FILES) {
    throw new Error("Invalid shared file list");
  }
  let total = 0;
  return value.map((file) => {
    if (!file || typeof file.name !== "string" || !file.name || file.name.length > 255 ||
        /[/\\\u0000-\u001f\u007f]/u.test(file.name) || !Number.isSafeInteger(file.sizeBytes) || file.sizeBytes < 0 ||
        typeof file.mimeType !== "string" || file.mimeType.length > 128 || /[\u0000-\u001f\u007f]/u.test(file.mimeType)) {
      throw new Error("Invalid shared file information");
    }
    total += file.sizeBytes;
    if (total > AGENT_WEBCLIENT_NATIVE_SHARE_MAX_BYTES) throw new Error("Shared files exceed the size limit");
    return { name: file.name, sizeBytes: file.sizeBytes, mimeType: file.mimeType };
  });
}

/** Preserve the native payload as files, including ZIP; never unpack or submit it. */
export async function readDesktopNativeShareFiles(
  target: DesktopNativeShareTarget,
  signal?: AbortSignal,
): Promise<File[]> {
  const manifest = await readDesktopNativeShare({ ...target, operation: "describe" }, signal);
  if (!("files" in manifest) || manifest.batchId !== target.batchId) throw new Error("The shared files belong to another import");
  const files = parseSharedFiles(manifest.files);
  const imported: File[] = [];
  for (let fileIndex = 0; fileIndex < files.length; fileIndex += 1) {
    const descriptor = files[fileIndex];
    const parts: BlobPart[] = [];
    let offset = 0;
    do {
      const chunk = await readDesktopNativeShare({ ...target, operation: "read", fileIndex, offset }, signal);
      if (!("dataBase64" in chunk) || typeof chunk.dataBase64 !== "string" || typeof chunk.eof !== "boolean" ||
          chunk.dataBase64.length > 4 * Math.ceil(AGENT_WEBCLIENT_NATIVE_SHARE_CHUNK_BYTES / 3) ||
          !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u.test(chunk.dataBase64)) {
        throw new Error("Invalid shared file data");
      }
      const binary = window.atob(chunk.dataBase64);
      const expected = Math.min(AGENT_WEBCLIENT_NATIVE_SHARE_CHUNK_BYTES, descriptor.sizeBytes - offset);
      if (binary.length !== expected || chunk.eof !== (offset + expected === descriptor.sizeBytes)) {
        throw new Error("The shared file changed while receiving it");
      }
      const bytes = new Uint8Array(binary.length);
      for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
      parts.push(bytes);
      offset += bytes.length;
    } while (offset < descriptor.sizeBytes);
    if (signal?.aborted) throw abortError();
    imported.push(new File(parts, descriptor.name, { type: descriptor.mimeType }));
  }
  return imported;
}

export async function completeDesktopNativeShare(target: DesktopNativeShareTarget, signal?: AbortSignal): Promise<void> {
  const result = await readDesktopNativeShare({ ...target, operation: "complete" }, signal);
  if (!("completed" in result) || result.completed !== true) throw new Error("The shared file import could not be confirmed");
}
