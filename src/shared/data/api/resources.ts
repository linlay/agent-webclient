import {
  getResourceRequestTarget,
} from "@/shared/data/api/resources/urls";
import {
  t,
} from "@/shared/i18n";
import {
  requestWithAuth,
  getErrorMessageFromText,
  ApiError,
} from "@/shared/data/api/http";
import type {
  ResourceDocumentMetadataResponse,
  ResourceDocumentTextResponse,
} from "@/shared/data/api/dto/resources";
import {
  endpointQuery,
  withQuery,
} from "@/shared/data/api/queryParams";
import {
  dataEndpoints,
} from "@/shared/data/api/endpoints";
import {
  resolveConversationExportAssetOrigin,
  CONVERSATION_EXPORT_TEMPLATE_PATH,
  MAX_CONVERSATION_SNAPSHOT_BYTES,
  conversationExportHtmlTooLargeError,
  MAX_CONVERSATION_TEMPLATE_BYTES,
  buildConversationHtmlBlob,
  conversationHtmlFilename,
} from "@/shared/data/conversationExport";

// Keep resource authentication and URL classification identical for reads and downloads.
function requestResource(
  path: string,
  options: { signal?: AbortSignal; chatId?: string; teamChat?: boolean },
  fallbackMessage: string,
  method: "GET" | "HEAD" = "GET",
): Promise<Response> {
  const target = getResourceRequestTarget(
    path,
    options.chatId || "",
    fallbackMessage,
    { teamChat: options.teamChat },
  );
  return requestWithAuth(target.fetchUrl, {
    method,
    signal: options.signal,
    jsonContentType: false,
    authFailureSource: "download",
    includePlatformAuth: target.requiresPlatformAuth,
  });
}

async function requireResourceSuccess(
  response: Response,
  messageKey: "api.downloadFailedWithStatus" | "api.loadResourceTextFailedWithStatus",
): Promise<void> {
  if (response.ok) return;
  const fallbackMessage = t(messageKey, { status: response.status });
  const rawText = await response.text();
  const error = getErrorMessageFromText(rawText, fallbackMessage, response.status);
  throw new ApiError(error.message, {
    status: response.status,
    code: error.code,
    data: error.data,
    platformError: error.platformError,
  });
}

export async function getResourceText(
  path: string,
  options: { signal?: AbortSignal; chatId?: string; teamChat?: boolean } = {},
): Promise<string> {
  const response = await requestResource(path, options, t("contentViewer.error.loadText"));

  await requireResourceSuccess(response, "api.loadResourceTextFailedWithStatus");
  return response.text();
}

const RESOURCE_DOCUMENT_KIND_HEADER = "X-Document-Kind";

const RESOURCE_DOCUMENT_REVISION_HEADER = "X-Document-Revision";

function resourceDocumentMetadata(response: Response): ResourceDocumentMetadataResponse {
  const rawKind = String(response.headers.get(RESOURCE_DOCUMENT_KIND_HEADER) || "").trim();
  const rawSize = String(response.headers.get("Content-Length") || "").trim();
  const sizeBytes = rawSize === "" ? Number.NaN : Number(rawSize);
  const allowedKinds = new Set([
    "document-html", "document-image", "document-markdown", "document-text",
    "document-code", "document-pdf", "document-office", "document-audio",
    "document-video", "document-archive", "document-binary",
  ]);
  return {
    revision: String(response.headers.get(RESOURCE_DOCUMENT_REVISION_HEADER) || "").trim(),
    mimeType: String(response.headers.get("Content-Type") || "").split(";", 1)[0].trim(),
    ...(Number.isFinite(sizeBytes) && sizeBytes >= 0 ? { sizeBytes } : {}),
    ...(allowedKinds.has(rawKind)
      ? { documentKind: rawKind as ResourceDocumentMetadataResponse["documentKind"] }
      : {}),
  };
}

export async function getResourceDocumentMetadata(
  path: string,
  options: { signal?: AbortSignal; chatId?: string; teamChat?: boolean } = {},
): Promise<ResourceDocumentMetadataResponse> {
  const response = await requestResource(path, options, t("contentViewer.error.loadText"), "HEAD");
  if (!response.ok) {
    throw new ApiError(t("contentViewer.error.loadText"), { status: response.status });
  }
  return resourceDocumentMetadata(response);
}

export async function getResourceDocumentText(
  path: string,
  options: { signal?: AbortSignal; chatId?: string; teamChat?: boolean } = {},
): Promise<ResourceDocumentTextResponse> {
  const response = await requestResource(path, options, t("contentViewer.error.loadText"));
  await requireResourceSuccess(response, "api.loadResourceTextFailedWithStatus");
  const metadata = resourceDocumentMetadata(response);
  return {
    content: await response.text(),
    ...metadata,
  };
}

export async function getResourceBlob(
  path: string,
  options: { signal?: AbortSignal; chatId?: string; teamChat?: boolean } = {},
): Promise<Blob> {
  const response = await requestResource(path, options, t("contentViewer.error.loadText"));
  await requireResourceSuccess(response, "api.downloadFailedWithStatus");
  return response.blob();
}

export async function getChatRawJsonl(
  chatId: string,
  options: { signal?: AbortSignal } = {},
): Promise<string> {
  const query = endpointQuery(dataEndpoints.chatJsonl, { chatId });
  const response = await requestWithAuth(withQuery(dataEndpoints.chatJsonl.path, query), {
    method: "GET",
    signal: options.signal,
    jsonContentType: false,
  });

  await requireResourceSuccess(response, "api.loadResourceTextFailedWithStatus");

  return response.text();
}

export async function getChatLLMTraceRaw(
  file: string,
  options: { signal?: AbortSignal } = {},
): Promise<string> {
  const query = endpointQuery(dataEndpoints.chatLlmTrace, { file });
  const response = await requestWithAuth(withQuery(dataEndpoints.chatLlmTrace.path, query), {
    method: "GET",
    signal: options.signal,
    jsonContentType: false,
  });

  await requireResourceSuccess(response, "api.loadResourceTextFailedWithStatus");

  return response.text();
}

function triggerBrowserDownload(blob: Blob, filename: string): void {
  if (
    typeof document === "undefined" ||
    typeof URL === "undefined" ||
    typeof URL.createObjectURL !== "function" ||
    typeof URL.revokeObjectURL !== "function"
  ) {
    throw new Error(t("api.fileDownloadUnsupported"));
  }

  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement("a");

  anchor.href = objectUrl;
  anchor.download = filename;
  anchor.rel = "noopener";
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);

  setTimeout(() => {
    URL.revokeObjectURL(objectUrl);
  }, 0);
}

export async function downloadResource(
  path: string,
  options: { filename?: string; signal?: AbortSignal; chatId?: string; teamChat?: boolean } = {},
): Promise<void> {
  const response = await requestResource(path, options, t("contentViewer.error.download"));

  await requireResourceSuccess(response, "api.downloadFailedWithStatus");

  const blob = await response.blob();
  const filename =
    String(options.filename || "").trim()
    || filenameFromContentDisposition(response.headers?.get("Content-Disposition") ?? null)
    || "download";
  triggerBrowserDownload(blob, filename);
}

function filenameFromContentDisposition(value: string | null): string {
  const header = String(value || "");
  const utf8Match = /filename\*=UTF-8''([^;]+)/i.exec(header);
  if (utf8Match?.[1]) {
    try {
      return decodeURIComponent(utf8Match[1].trim());
    } catch {
      return utf8Match[1].trim();
    }
  }
  const quotedMatch = /filename="([^"]+)"/i.exec(header);
  if (quotedMatch?.[1]) return quotedMatch[1].trim();
  const plainMatch = /filename=([^;]+)/i.exec(header);
  return plainMatch?.[1] ? plainMatch[1].trim() : "";
}

export async function downloadChatExport(chatId: string): Promise<void> {
  const path = `${dataEndpoints.chatExport.path}?chatId=${encodeURIComponent(chatId)}`;
  const response = await requestWithAuth(path, {
    method: "GET",
    jsonContentType: false,
    authFailureSource: "download",
  });
  await requireResourceSuccess(response, "api.downloadFailedWithStatus");
  const blob = await response.blob();
  const filename =
    filenameFromContentDisposition(response.headers.get("Content-Disposition"))
    || `${chatId || "chat"}.md`;
  triggerBrowserDownload(blob, filename);
}

export async function downloadConversationHtmlExport(
  chatId: string,
): Promise<void> {
  const normalizedChatId = chatId.trim();
  if (!normalizedChatId) throw new Error("chat_id_required");

  const assetOrigin = resolveConversationExportAssetOrigin();
  const [snapshotResponse, templateResponse] = await Promise.all([
    requestWithAuth(
      `${dataEndpoints.chatExport.path}?chatId=${encodeURIComponent(normalizedChatId)}&format=snapshot`,
      {
        method: "GET",
        jsonContentType: false,
        authFailureSource: "download",
        headers: { Accept: "application/json" },
      },
    ),
    fetch(CONVERSATION_EXPORT_TEMPLATE_PATH, {
      method: "GET",
      credentials: "same-origin",
      redirect: "error",
      cache: "no-store",
      headers: { Accept: "text/html" },
    }),
  ]);

  if (!snapshotResponse.ok) {
    const rawText = await snapshotResponse.text();
    const fallbackMessage = t("api.downloadFailedWithStatus", {
      status: snapshotResponse.status,
    });
    const error = getErrorMessageFromText(
      rawText,
      fallbackMessage,
      snapshotResponse.status,
    );
    throw new ApiError(error.message, {
      status: snapshotResponse.status,
      code: error.code,
      data: error.data,
      platformError: error.platformError,
    });
  }
  if (!templateResponse.ok) {
    throw new Error(`conversation_export_template_unavailable: status=${templateResponse.status}`);
  }

  const snapshotContentType = snapshotResponse.headers
      .get("Content-Type")
      ?.split(";", 1)[0]
      ?.trim()
      .toLowerCase();
  if (snapshotContentType !== "application/json") {
    throw new Error("conversation_export_snapshot_unsupported");
  }
  const templateContentType = templateResponse.headers
    .get("Content-Type")
    ?.split(";", 1)[0]
    ?.trim()
    .toLowerCase();
  if (templateContentType !== "text/html") {
    throw new Error("conversation_export_template_invalid");
  }

  requireConversationExportLength(
    snapshotResponse,
    MAX_CONVERSATION_SNAPSHOT_BYTES,
    conversationExportHtmlTooLargeError,
  );
  requireConversationExportLength(
    templateResponse,
    MAX_CONVERSATION_TEMPLATE_BYTES,
    (actual) => new Error(
      `conversation_export_template_too_large: actual=${actual} limit=${MAX_CONVERSATION_TEMPLATE_BYTES}`,
    ),
  );
  const [snapshot, template] = await Promise.all([
    snapshotResponse.blob(),
    templateResponse.text(),
  ]);
  const html = buildConversationHtmlBlob({ template, snapshot, assetOrigin });
  const filename =
    conversationHtmlFilename(
      filenameFromContentDisposition(snapshotResponse.headers.get("Content-Disposition")),
      normalizedChatId,
    );
  triggerBrowserDownload(html, filename);
}

function requireConversationExportLength(
  response: Response,
  limit: number,
  errorFactory: (actualBytes: number) => Error,
): void {
  const rawLength = response.headers.get("Content-Length");
  if (rawLength === null) return;
  const declaredLength = Number(rawLength);
  if (Number.isFinite(declaredLength) && declaredLength > limit) {
    throw errorFactory(declaredLength);
  }
}

export function buildAdminSkillFileDownloadUrl(key: string, path: string): string {
  const query = endpointQuery(dataEndpoints.adminSkillFileDownload, { key, path });
  return withQuery(dataEndpoints.adminSkillFileDownload.path, query);
}

export function buildAdminSkillDownloadUrl(key: string): string {
  const query = endpointQuery(dataEndpoints.adminSkillDownload, { key });
  return withQuery(dataEndpoints.adminSkillDownload.path, query);
}

async function readAdminSkillDownload(path: string, fallbackFilename: string, signal?: AbortSignal): Promise<void> {
  const response = await requestWithAuth(path, {
    method: "GET",
    signal,
    jsonContentType: false,
  });
  await requireResourceSuccess(response, "api.downloadFailedWithStatus");
  const blob = await response.blob();
  const filename = filenameFromContentDisposition(response.headers.get("Content-Disposition")) || fallbackFilename;
  triggerBrowserDownload(blob, filename);
}

export async function downloadAdminSkillFile(
  key: string,
  path: string,
  options: { signal?: AbortSignal } = {},
): Promise<void> {
  const filename = path.split("/").filter(Boolean).at(-1) || "skill-file";
  return readAdminSkillDownload(buildAdminSkillFileDownloadUrl(key, path), filename, options.signal);
}

export async function downloadAdminSkill(
  key: string,
  options: { signal?: AbortSignal } = {},
): Promise<void> {
  return readAdminSkillDownload(buildAdminSkillDownloadUrl(key), `${key || "skill"}.zip`, options.signal);
}

export async function fetchAdminSkillIcon(
  url: string,
  options: { signal?: AbortSignal } = {},
): Promise<Blob> {
  const path = url.trim();
  if (!/^\/api\/admin\/skills\/file\/download(?:[?#]|$)/.test(path)) {
    throw new ApiError("skill icon URL is invalid");
  }
  const response = await requestWithAuth(path, {
    method: "GET",
    signal: options.signal,
    jsonContentType: false,
  });
  await requireResourceSuccess(response, "api.downloadFailedWithStatus");
  const contentType = String(response.headers.get("Content-Type") || "").toLowerCase();
  if (!contentType.startsWith("image/")) {
    throw new ApiError("skill icon response is not an image", { status: response.status });
  }
  return response.blob();
}

export async function fetchConnectorIcon(
  url: string,
  options: { signal?: AbortSignal } = {},
): Promise<Blob> {
  const path = url.trim();
  if (path.split("?", 1)[0] !== dataEndpoints.connectorIcon.path || path.includes("#")) {
    throw new ApiError("connector icon URL is invalid");
  }
  const response = await requestWithAuth(path, {
    method: dataEndpoints.connectorIcon.method,
    signal: options.signal,
    jsonContentType: false,
  });
  await requireResourceSuccess(response, "api.downloadFailedWithStatus");
  const contentType = String(response.headers.get("Content-Type") || "").split(";", 1)[0].trim().toLowerCase();
  if (!["image/png", "image/svg+xml"].includes(contentType)) {
    throw new ApiError("connector icon response is not a supported image", { status: response.status });
  }
  return response.blob();
}

export async function fetchAdminSkillFileBlob(
  key: string,
  path: string,
  options: { signal?: AbortSignal } = {},
): Promise<Blob> {
  const response = await requestWithAuth(buildAdminSkillFileDownloadUrl(key, path), {
    method: "GET",
    signal: options.signal,
    jsonContentType: false,
  });
  await requireResourceSuccess(response, "api.downloadFailedWithStatus");
  return response.blob();
}
