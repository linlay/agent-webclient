import { t } from "@/shared/i18n";

export type ViewerContentKind =
  | "image"
  | "pdf"
  | "html"
  | "text"
  | "audio"
  | "video"
  | "office"
  | "unsupported";

export interface ResourceViewerTarget {
  type: "resource";
  name: string;
  url: string;
  downloadUrl: string;
  contentKind: ViewerContentKind;
  sizeBytes?: number;
  resourceType?: string;
  mimeType?: string;
}

export interface FileViewerTarget {
  type: "file";
  name: string;
  agentKey: string;
  path: string;
  contentKind: ViewerContentKind;
  line?: number;
}

export type ViewerTarget = ResourceViewerTarget | FileViewerTarget;

export interface ViewerContentDescriptor {
  name?: string;
  url?: string;
  mimeType?: string;
  contentKind?: ViewerContentKind;
}

export interface ResourceViewerInput extends ViewerContentDescriptor {
  downloadUrl?: string;
  sizeBytes?: number;
  resourceType?: string;
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
  "c",
  "cpp",
  "css",
  "csv",
  "go",
  "html",
  "java",
  "js",
  "json",
  "log",
  "md",
  "mjs",
  "py",
  "rb",
  "rs",
  "sh",
  "sql",
  "svg",
  "ts",
  "tsx",
  "txt",
  "xml",
  "yaml",
  "yml",
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

function displayFileName(path: string): string {
  const normalized = path.replace(/\\/g, "/");
  return normalized.split("/").filter(Boolean).pop() || path;
}

export function detectViewerContentKind(
  input: ViewerContentDescriptor,
): ViewerContentKind {
  if (input.contentKind) return input.contentKind;

  const mimeType = normalizeText(input.mimeType).split(";", 1)[0].trim();
  const extension = getFileExtension(input.name || input.url);

  if (mimeType.startsWith("image/") || imageExtensions.has(extension)) {
    return "image";
  }

  if (mimeType === "application/pdf" || extension === "pdf") {
    return "pdf";
  }

  if (
    officeExtensions.has(extension) ||
    mimeType === "application/msword" ||
    mimeType === "application/vnd.ms-excel" ||
    mimeType === "application/vnd.ms-powerpoint" ||
    mimeType.startsWith("application/vnd.ms-excel.") ||
    mimeType.startsWith("application/vnd.ms-powerpoint.") ||
    mimeType.startsWith("application/vnd.openxmlformats-officedocument.")
  ) {
    return "office";
  }

  if (
    mimeType === "text/html" ||
    mimeType === "application/xhtml+xml" ||
    extension === "html" ||
    extension === "htm" ||
    extension === "xhtml"
  ) {
    return "html";
  }

  if (mimeType.startsWith("audio/") || audioExtensions.has(extension)) {
    return "audio";
  }

  if (mimeType.startsWith("video/") || videoExtensions.has(extension)) {
    return "video";
  }

  if (
    mimeType.startsWith("text/") ||
    mimeType.includes("json") ||
    mimeType.includes("xml") ||
    mimeType.includes("javascript") ||
    mimeType.includes("ecmascript") ||
    mimeType.includes("yaml") ||
    textExtensions.has(extension)
  ) {
    return "text";
  }

  return "unsupported";
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
    contentKind: detectViewerContentKind(input),
    sizeBytes: Number.isFinite(size) && size >= 0 ? size : undefined,
    resourceType: input.resourceType,
    mimeType: input.mimeType,
  };
}

export function getResourceViewerName(source: string): string {
  const normalized = String(source || "").trim().split(/[?#]/u, 1)[0];
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
    contentKind: detectViewerContentKind({ name }),
    line: Number.isFinite(line) && line > 0 ? Math.floor(line) : undefined,
  };
}

export function getViewerTargetKey(target: ViewerTarget): string {
  return target.type === "file"
    ? `file:${target.agentKey}:${target.path}`
    : `resource:${target.url}`;
}
