// Webpack emits the bundled browser builds; the document frame never loads third-party scripts.
// docx-preview does not export its classic browser build. Use its installed file directly
// so asset resolution also works in dev compilers started before the viewer was added.
export const docxPreviewAssets = {
  zip: new URL("jszip/dist/jszip.min.js", import.meta.url).href,
  docx: new URL("../../../../node_modules/docx-preview/dist/docx-preview.min.js", import.meta.url).href,
};
