#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const ts = require("typescript");

const projectRoot = path.resolve(__dirname, "..");
const srcRoot = path.join(projectRoot, "src");
const allowlistPath = path.join(__dirname, "i18n-han-allowlist.json");
const allowlist = JSON.parse(fs.readFileSync(allowlistPath, "utf8"));
const HAN_REGEX = /[\p{Script=Han}]/u;

function walk(dirPath, bucket = []) {
  for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
    const entryPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      walk(entryPath, bucket);
      continue;
    }
    if (!/\.(ts|tsx)$/.test(entry.name)) continue;
    if (/\.test\.(ts|tsx)$/.test(entry.name)) continue;
    if (entryPath.includes(`${path.sep}locales${path.sep}`)) continue;
    bucket.push(entryPath);
  }
  return bucket;
}

function shouldIgnoreStringLiteral(node) {
  const parent = node.parent;
  return Boolean(
    parent &&
      (ts.isImportDeclaration(parent) ||
        ts.isExportDeclaration(parent) ||
        ts.isImportSpecifier(parent) ||
        ts.isLiteralTypeNode(parent) ||
        ts.isPropertyAssignment(parent) &&
          ts.isIdentifier(parent.name) &&
          parent.name.text === "icon"),
  );
}

function collectViolations(filePath) {
  const sourceText = fs.readFileSync(filePath, "utf8");
  const sourceFile = ts.createSourceFile(
    filePath,
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    filePath.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const violations = [];

  function visit(node) {
    if (
      (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) &&
      HAN_REGEX.test(node.text) &&
      !shouldIgnoreStringLiteral(node)
    ) {
      const line = sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1;
      violations.push({
        line,
        text: node.text.trim(),
      });
    }

    if (ts.isJsxText(node) && HAN_REGEX.test(node.getText())) {
      const text = node.getText().trim();
      if (text) {
        const line = sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1;
        violations.push({ line, text });
      }
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return violations;
}

const files = walk(srcRoot);
const unexpectedViolations = [];

for (const filePath of files) {
  const relativePath = path.relative(projectRoot, filePath).replace(/\\/g, "/");
  const violations = collectViolations(filePath);
  if (violations.length === 0) {
    continue;
  }
  if (allowlist.includes(relativePath)) {
    continue;
  }
  unexpectedViolations.push({ file: relativePath, violations });
}

if (unexpectedViolations.length > 0) {
  console.error("Unexpected Han text outside the i18n allowlist:\n");
  for (const item of unexpectedViolations) {
    console.error(`- ${item.file}`);
    for (const violation of item.violations.slice(0, 5)) {
      console.error(`  line ${violation.line}: ${violation.text}`);
    }
  }
  process.exit(1);
}

console.log("i18n han check passed");
