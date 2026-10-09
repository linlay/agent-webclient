import { t } from "@/shared/i18n";
import type { DocumentContentKind } from "@/shared/types/document";

export type { DocumentContentKind } from "@/shared/types/document";

export type ViewerContentKind =
  | "image"
  | "pdf"
  | "html"
  | "text"
  | "audio"
  | "video"
  | "office"
  | "unsupported";

export type ResourceDocumentSource = {
  kind: "artifact" | "reference";
  agentKey: string;
  chatId: string;
  resourceId: string;
  relativePath: string;
};

export interface ResourceViewerTarget {
  type: "resource";
  name: string;
  url: string;
  downloadUrl: string;
  contentKind: ViewerContentKind;
  documentKind?: DocumentContentKind;
  sizeBytes?: number;
  resourceType?: string;
  mimeType?: string;
  revision?: string;
  source?: ResourceDocumentSource;
}

export interface FileViewerTarget {
  type: "file";
  name: string;
  agentKey: string;
  path: string;
  contentKind: ViewerContentKind;
  documentKind?: DocumentContentKind;
  line?: number;
}

export type ViewerTarget = ResourceViewerTarget | FileViewerTarget;

export interface ViewerContentDescriptor {
  name?: string;
  url?: string;
  mimeType?: string;
  contentKind?: ViewerContentKind;
  documentKind?: DocumentContentKind;
}

export interface ResourceViewerInput extends ViewerContentDescriptor {
  downloadUrl?: string;
  sizeBytes?: number;
  resourceType?: string;
  revision?: string;
  source?: ResourceDocumentSource;
}

const audioExtensions = new Set([
  "aac",
  "flac",
  "m4a",
  "mp3",
  "oga",
  "ogg",
  "opus",
  "wav",
  "weba",
]);

const imageExtensions = new Set([
  "apng",
  "avif",
  "bmp",
  "gif",
  "heic",
  "heif",
  "ico",
  "jpeg",
  "jpg",
  "png",
  "svg",
  "tif",
  "tiff",
  "webp",
]);

const textExtensions = new Set([
  "csv",
  "log",
  "txt",
  "tsv",
]);

const markdownExtensions = new Set(["md", "markdown", "mdx"]);

const codeExtensions = new Set([
  "c", "cc", "cpp", "css", "go", "h", "hpp", "ini", "java", "js",
  "json", "jsx", "mjs", "py", "rb", "rs", "sh", "sql", "toml", "ts",
  "tsx", "xml", "yaml", "yml",
]);

const archiveExtensions = new Set([
  "7z", "bz2", "gz", "rar", "tar", "tgz", "xz", "zip",
]);

const videoExtensions = new Set([
  "m4v",
  "mov",
  "mp4",
  "mpeg",
  "mpg",
  "ogv",
  "webm",
]);

const officeExtensions = new Set([
  "doc",
  "docm",
  "docx",
  "dot",
  "dotm",
  "dotx",
  "pot",
  "potm",
  "potx",
  "pps",
  "ppsm",
  "ppsx",
  "ppt",
  "pptm",
  "pptx",
  "xla",
  "xlam",
  "xls",
  "xlsb",
  "xlsm",
  "xlsx",
  "xlt",
  "xltm",
  "xltx",
]);

function normalizeText(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function getFileExtension(name?: string): string {
  const normalizedName = String(name || "").trim().split(/[?#]/, 1)[0];
  const lastDotIndex = normalizedName.lastIndexOf(".");
  if (lastDotIndex < 0 || lastDotIndex === normalizedName.length - 1) {
    return "";
  }
  return normalizedName.slice(lastDotIndex + 1).toLowerCase();
}

export function isKnownTextDocumentName(name?: string): boolean {
  const extension = getFileExtension(name);
  return markdownExtensions.has(extension) ||
    textExtensions.has(extension) ||
    codeExtensions.has(extension);
}

function displayFileName(path: string): string {
  const normalized = path.replace(/\\/g, "/");
  return normalized.split("/").filter(Boolean).pop() || path;
}

export function detectViewerContentKind(
  input: ViewerContentDescriptor,
): ViewerContentKind {
  if (input.contentKind) return input.contentKind;

  return viewerContentKindForDocument(detectDocumentContentKind(input));
}

export function viewerContentKindForDocument(
  kind: DocumentContentKind,
): ViewerContentKind {
  switch (kind) {
    case "document-image": return "image";
    case "document-pdf": return "pdf";
    case "document-html": return "html";
    case "document-markdown":
    case "document-text":
    case "document-code": return "text";
    case "document-audio": return "audio";
    case "document-video": return "video";
    case "document-office": return "office";
    default: return "unsupported";
  }
}

export function detectDocumentContentKind(
  input: ViewerContentDescriptor,
): DocumentContentKind {
  if (input.documentKind) return input.documentKind;

  const mimeType = normalizeText(input.mimeType).split(";", 1)[0].trim();
  const extension = getFileExtension(input.name || input.url);

  // OpenXML is a ZIP container, so Office must win before Archive.
  if (
    officeExtensions.has(extension) ||
    mimeType === "application/msword" ||
    mimeType === "application/vnd.ms-excel" ||
    mimeType === "application/vnd.ms-powerpoint" ||
    mimeType.startsWith("application/vnd.ms-excel.") ||
    mimeType.startsWith("application/vnd.ms-powerpoint.") ||
    mimeType.startsWith("application/vnd.openxmlformats-officedocument.")
  ) {
    return "document-office";
  }

  if (mimeType === "application/pdf" || extension === "pdf") {
    return "document-pdf";
  }

  // SVG stays in the image surface even though its payload is XML text.
  if (mimeType.startsWith("image/") || imageExtensions.has(extension)) {
    return "document-image";
  }

  if (
    mimeType === "text/html" ||
    mimeType === "application/xhtml+xml" ||
    extension === "html" ||
    extension === "htm" ||
    extension === "xhtml"
  ) {
    return "document-html";
  }

  if (mimeType === "text/markdown" || markdownExtensions.has(extension)) {
    return "document-markdown";
  }

  if (mimeType.startsWith("audio/") || audioExtensions.has(extension)) {
    return "document-audio";
  }

  if (mimeType.startsWith("video/") || videoExtensions.has(extension)) {
    return "document-video";
  }

  if (
    archiveExtensions.has(extension) ||
    mimeType === "application/zip" ||
    mimeType === "application/x-7z-compressed" ||
    mimeType === "application/x-rar-compressed"
  ) {
    return "document-archive";
  }

  if (
    mimeType.includes("json") ||
    mimeType.includes("xml") ||
    mimeType.includes("javascript") ||
    mimeType.includes("ecmascript") ||
    mimeType.includes("yaml") ||
    codeExtensions.has(extension)
  ) {
    return "document-code";
  }

  if (mimeType.startsWith("text/") || textExtensions.has(extension)) {
    return "document-text";
  }

  return "document-binary";
}

export function isViewerContentSupported(kind: ViewerContentKind): boolean {
  return kind !== "office" && kind !== "unsupported";
}

export function buildResourceViewerTarget(
  input: ResourceViewerInput,
): ResourceViewerTarget | null {
  const url = String(input.url || "").trim();
  if (!url) return null;

  const size = Number(input.sizeBytes);

  return {
    type: "resource",
    name: String(input.name || "").trim() || t("attachments.unnamedResource"),
    url,
    downloadUrl: String(input.downloadUrl || url).trim(),
    documentKind: detectDocumentContentKind(input),
    contentKind: detectViewerContentKind(input),
    sizeBytes: Number.isFinite(size) && size >= 0 ? size : undefined,
    resourceType: input.resourceType,
    mimeType: input.mimeType,
    ...(input.revision ? { revision: input.revision } : {}),
    ...(input.source ? { source: input.source } : {}),
  };
}

export function getResourceViewerName(source: string): string {
  const trimmed = String(source || "").trim();
  // An @chat/ path is literal: "?" and "#" belong to the file name.
  const normalized = /^@chat\//iu.test(trimmed) ? trimmed : trimmed.split(/[?#]/u, 1)[0];
  const segment = normalized.split("/").filter(Boolean).pop() || normalized;
  try {
    return decodeURIComponent(segment) || t("attachments.unnamedResource");
  } catch {
    return segment || t("attachments.unnamedResource");
  }
}

export function buildResourceViewerTargetFromUrl(
  source: string,
): ResourceViewerTarget | null {
  const url = String(source || "").trim();
  if (!url) return null;
  const name = getResourceViewerName(url);
  return {
    type: "resource",
    name,
    url,
    downloadUrl: url,
    documentKind: detectDocumentContentKind({ name }),
    contentKind: detectViewerContentKind({ name }),
  };
}

export function buildFileViewerTarget(input: {
  agentKey: string;
  path: string;
  line?: number;
}): FileViewerTarget | null {
  const agentKey = String(input.agentKey || "").trim();
  const path = typeof input.path === "string" ? input.path : "";
  if (!agentKey || !path) return null;
  const name = displayFileName(path);
  const line = Number(input.line || 0);
  return {
    type: "file",
    name,
    agentKey,
    path,
    documentKind: detectDocumentContentKind({ name }),
    contentKind: detectViewerContentKind({ name }),
    line: Number.isFinite(line) && line > 0 ? Math.floor(line) : undefined,
  };
}

export function getViewerTargetKey(target: ViewerTarget): string {
  return target.type === "file"
    ? `file:${target.agentKey}:${target.path}`
    : `resource:${target.url}`;
}
