#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");
const JSZip = require("jszip");
const { validatePackage } = require("./conversation-export-package");
async function packageExport(root) {
  const source = path.join(root, "dist/export");
  const { files } = validatePackage(source);
  const zip = new JSZip();
  for (const name of files) zip.file(name, fs.readFileSync(path.join(source, name)), { createFolders: false });
  const output = path.join(root, "dist/conversation-export.zip");
  const temporary = `${output}.${process.pid}.tmp`;
  try {
    fs.writeFileSync(temporary, await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" }), { flag: "wx" });
    fs.renameSync(temporary, output);
  } finally {
    fs.rmSync(temporary, { force: true });
  }
  return output;
}
if (require.main === module) packageExport(path.resolve(__dirname, "..")).then((output) => console.log(`Packaged ${output}`)).catch((error) => { console.error(error.message); process.exitCode = 1; });
module.exports = { packageExport };
