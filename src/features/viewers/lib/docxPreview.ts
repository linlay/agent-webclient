export const DOCX_MAX_BYTES = 32 * 1024 * 1024;
const DOCX_MAX_EXPANDED_BYTES = 128 * 1024 * 1024;

export function isDocxDocument(name: string): boolean {
  return /\.docx$/iu.test(name.trim());
}

// Bound ZIP work before the renderer inflates images/XML. ZIP64, encrypted and
// malformed packages fall back to explicit download instead of blocking the UI.
export function validateDocxArchive(data: ArrayBuffer): void {
  if (data.byteLength > DOCX_MAX_BYTES || data.byteLength < 22) throw new Error("invalid_docx");
  const view = new DataView(data);
  let end = data.byteLength - 22;
  for (; end >= Math.max(0, data.byteLength - 65557); end--) {
    if (view.getUint32(end, true) === 0x06054b50 && end + 22 + view.getUint16(end + 20, true) === data.byteLength) break;
  }
  if (end < 0 || view.getUint32(end, true) !== 0x06054b50) throw new Error("invalid_docx");
  const count = view.getUint16(end + 10, true);
  const size = view.getUint32(end + 12, true);
  let offset = view.getUint32(end + 16, true);
  const limit = offset + size;
  if (!count || count > 4096 || limit !== end || view.getUint32(end + 4, true) !== 0
    || view.getUint16(end + 8, true) !== count) throw new Error("invalid_docx");
  let expanded = 0;
  let hasDocument = false;
  const names = new Set<string>();
  for (let index = 0; index < count; index++) {
    if (offset + 46 > limit || view.getUint32(offset, true) !== 0x02014b50) throw new Error("invalid_docx");
    expanded += view.getUint32(offset + 24, true);
    const nameSize = view.getUint16(offset + 28, true);
    const next = offset + 46 + nameSize + view.getUint16(offset + 30, true) + view.getUint16(offset + 32, true);
    if (next > limit || expanded > DOCX_MAX_EXPANDED_BYTES || (view.getUint16(offset + 8, true) & 1)) throw new Error("invalid_docx");
    const name = new TextDecoder().decode(new Uint8Array(data, offset + 46, nameSize));
    if (names.has(name) || name.startsWith("/") || name.includes("\\") || name.split("/").includes("..")) throw new Error("invalid_docx");
    names.add(name);
    if (name === "word/document.xml") hasDocument = true;
    offset = next;
  }
  if (!hasDocument || !names.has("[Content_Types].xml") || offset !== limit) throw new Error("invalid_docx");
}
