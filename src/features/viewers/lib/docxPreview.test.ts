import JSZip from "jszip";
import { createDocxFrameHtml } from "./docxPreviewFrame";
import { DOCX_MAX_BYTES, isDocxDocument, validateDocxArchive } from "./docxPreview";

async function archive() {
  const zip = new JSZip();
  zip.file("[Content_Types].xml", "<Types/>");
  zip.file("word/document.xml", "<document/>");
  return zip.generateAsync({ type: "arraybuffer" });
}

it("accepts DOCX ZIP packages and keeps older Office formats out of the renderer", async () => {
  expect(isDocxDocument("工会申请表.DOCX")).toBe(true);
  expect(isDocxDocument("申请表.doc")).toBe(false);
  expect(() => validateDocxArchive(new ArrayBuffer(0))).toThrow();
  expect(() => validateDocxArchive(new ArrayBuffer(DOCX_MAX_BYTES + 1))).toThrow();
  expect(() => validateDocxArchive(new TextEncoder().encode("not a Word document").buffer)).toThrow();
  expect(() => validateDocxArchive(new ArrayBuffer(100000))).toThrow();
  expect(() => validateDocxArchive(new ArrayBuffer(22))).toThrow();
  expect(() => validateDocxArchive(new ArrayBuffer(100))).toThrow();
  expect(() => validateDocxArchive(new Uint8Array([0x50, 0x4b, 3, 4]).buffer)).toThrow();
  const data = await archive();
  expect(() => validateDocxArchive(data)).not.toThrow();
  expect(() => validateDocxArchive(data.slice(0, -5))).toThrow();
});

it("rejects encrypted packages and oversized declared expansion before rendering", async () => {
  const data = await archive();
  const view = new DataView(data);
  const directory = view.getUint32(data.byteLength - 6, true);
  view.setUint32(directory + 24, 0xffffffff, true);
  expect(() => validateDocxArchive(data)).toThrow();
  const encrypted = await archive();
  const encryptedView = new DataView(encrypted);
  const offset = encryptedView.getUint32(encrypted.byteLength - 6, true);
  encryptedView.setUint16(offset + 8, 1, true);
  expect(() => validateDocxArchive(encrypted)).toThrow();
});

it("denies scripts, remote resources and forms in the document frame", () => {
  expect(createDocxFrameHtml("test-token", { zip: "/zip.js", docx: "/docx.js" })).toContain("default-src 'none'");
  expect(createDocxFrameHtml("test-token", { zip: "/zip.js", docx: "/docx.js" })).toContain("img-src data: blob:");
  expect(createDocxFrameHtml("test-token", { zip: "/zip.js", docx: "/docx.js" })).toContain("form-action 'none'");
});
