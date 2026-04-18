export interface AttachmentLike {
  name?: string;
  size?: number;
  type?: string;
  mimeType?: string;
  url?: string;
  previewUrl?: string;
}

const imageExtensions = new Set([
  'apng',
  'avif',
  'bmp',
  'gif',
  'heic',
  'heif',
  'ico',
  'jpeg',
  'jpg',
  'png',
  'svg',
  'tif',
  'tiff',
  'webp',
]);

function normalizeText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeLowerText(value: unknown): string {
  return normalizeText(value).toLowerCase();
}

export function formatAttachmentSize(size?: number): string {
  if (!Number.isFinite(size) || Number(size) <= 0) {
    return '';
  }

  const units = ['B', 'KB', 'MB', 'GB'];
  let value = Number(size);
  let unitIndex = 0;

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  const precision = value >= 100 || unitIndex === 0 ? 0 : 1;
  return `${value.toFixed(precision)} ${units[unitIndex]}`;
}

export function getAttachmentExtension(name?: string): string {
  const normalizedName = normalizeText(name).split(/[?#]/, 1)[0];
  const lastDotIndex = normalizedName.lastIndexOf('.');
  if (
    lastDotIndex < 0 ||
    lastDotIndex === normalizedName.length - 1
  ) {
    return '';
  }

  return normalizedName.slice(lastDotIndex + 1).toLowerCase();
}

export function getAttachmentKind(
  attachment: AttachmentLike,
): 'image' | 'file' {
  const rawType = normalizeLowerText(attachment.type);
  if (rawType === 'image') {
    return 'image';
  }

  const mimeType = normalizeLowerText(attachment.mimeType);
  if (mimeType.startsWith('image/')) {
    return 'image';
  }

  return imageExtensions.has(getAttachmentExtension(attachment.name))
    ? 'image'
    : 'file';
}

export function isImageAttachment(attachment: AttachmentLike): boolean {
  return getAttachmentKind(attachment) === 'image';
}

export function getAttachmentKindLabel(attachment: AttachmentLike): string {
  return isImageAttachment(attachment) ? '图片' : '文件';
}

export function getAttachmentIconName(attachment: AttachmentLike): string {
  if (isImageAttachment(attachment)) {
    return 'image';
  }

  const extension = getAttachmentExtension(attachment.name);
  const mimeType = normalizeLowerText(attachment.mimeType);

  if (extension === 'pdf' || mimeType === 'application/pdf') {
    return 'picture_as_pdf';
  }

  if (
    ['csv', 'numbers', 'xls', 'xlsx'].includes(extension) ||
    mimeType.includes('spreadsheet')
  ) {
    return 'table_chart';
  }

  if (
    ['key', 'ppt', 'pptx'].includes(extension) ||
    mimeType.includes('presentation')
  ) {
    return 'slideshow';
  }

  if (
    ['7z', 'gz', 'rar', 'tar', 'zip'].includes(extension) ||
    mimeType.includes('zip') ||
    mimeType.includes('compressed')
  ) {
    return 'folder_zip';
  }

  if (
    ['doc', 'docx', 'pages', 'rtf'].includes(extension) ||
    mimeType.includes('wordprocessingml') ||
    mimeType.includes('msword')
  ) {
    return 'article';
  }

  if (
    ['json', 'log', 'md', 'txt', 'xml', 'yaml', 'yml'].includes(extension) ||
    mimeType.startsWith('text/')
  ) {
    return 'description';
  }

  return 'draft';
}

export function getAttachmentUrl(attachment: AttachmentLike): string {
  const previewUrl = normalizeText(attachment.previewUrl);
  if (previewUrl) {
    return previewUrl;
  }

  return normalizeText(attachment.url);
}

export function getAttachmentDownloadUrl(attachment: AttachmentLike): string {
  const resourceUrl = normalizeText(attachment.url);
  if (resourceUrl) {
    return resourceUrl;
  }

  return getAttachmentUrl(attachment);
}
