#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const ts = require("typescript");

const root = path.resolve(__dirname, "..");
const srcRoot = path.join(root, "src");
const localeDir = path.join(srcRoot, "shared", "i18n", "locales");
const allowlistPath = path.join(__dirname, "i18n-han-allowlist.json");
const han = /\p{Script=Han}/u;
const latin = /[A-Za-z]/;
const placeholders = /\{([^}]+)\}/g;
const displayAttributeNames = new Set([
  "aria-label",
  "aria-description",
  "alt",
  "placeholder",
  "title",
]);
const displayPropertyNames = new Set([
  "ariaLabel",
  "description",
  "emptyText",
  "label",
  "message",
  "placeholder",
  "title",
  "tooltip",
]);
const displayCallNames = new Set([
  "error",
  "info",
  "setAsrDebugStatus",
  "setError",
  "setStatusText",
  "success",
  "warning",
]);

function relative(file) {
  return path.relative(root, file).replace(/\\/g, "/");
}

function walk(dir, files = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(file, files);
    else if (/\.(ts|tsx)$/.test(entry.name)) files.push(file);
  }
  return files;
}

function sourceFile(file) {
  return ts.createSourceFile(
    file,
    fs.readFileSync(file, "utf8"),
    ts.ScriptTarget.Latest,
    true,
    file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
}

function lineOf(file, node) {
  return file.getLineAndCharacterOfPosition(node.getStart()).line + 1;
}

function literalText(node, file) {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
    return node.text.trim();
  }
  if (ts.isTemplateExpression(node)) {
    return [node.head.text, ...node.templateSpans.map((span) => span.literal.text)]
      .join("")
      .trim();
  }
  if (ts.isJsxText(node)) return node.getText().trim();
  return "";
}

function keyValues(file) {
  const values = new Map();
  function visit(node) {
    if (
      ts.isPropertyAssignment(node) &&
      ts.isStringLiteral(node.name) &&
      (ts.isStringLiteral(node.initializer) ||
        ts.isNoSubstitutionTemplateLiteral(node.initializer))
    ) {
      values.set(node.name.text, node.initializer.text);
    }
    ts.forEachChild(node, visit);
  }
  visit(file);
  return values;
}

function readAllowlist() {
  const raw = JSON.parse(fs.readFileSync(allowlistPath, "utf8"));
  const entries = new Map();
  const issues = [];
  for (const [file, values] of Object.entries(raw)) {
    if (!Array.isArray(values)) {
      issues.push(`allowlist entry for ${file} must be an array`);
      continue;
    }
    const textValues = new Set();
    for (const value of values) {
      const text = String(value?.text || "").trim();
      const reason = String(value?.reason || "").trim();
      if (!text || !reason) {
        issues.push(`allowlist entry for ${file} must include text and reason`);
        continue;
      }
      textValues.add(text);
    }
    entries.set(file, textValues);
  }
  return { entries, issues };
}

function parameterSet(value) {
  return new Set(Array.from(value.matchAll(placeholders), (match) => match[1].trim()));
}

function equalSets(left, right) {
  return left.size === right.size && [...left].every((value) => right.has(value));
}

function checkLocales() {
  const enFile = sourceFile(path.join(localeDir, "en-US.ts"));
  const zhFile = sourceFile(path.join(localeDir, "zh-CN.ts"));
  const en = keyValues(enFile);
  const zh = keyValues(zhFile);
  const issues = [];
  for (const key of en.keys()) {
    if (!zh.has(key)) issues.push(`zh-CN is missing key ${key}`);
  }
  for (const key of zh.keys()) {
    if (!en.has(key)) issues.push(`en-US is missing key ${key}`);
  }
  for (const [key, enValue] of en) {
    const zhValue = zh.get(key);
    if (zhValue && !equalSets(parameterSet(enValue), parameterSet(zhValue))) {
      issues.push(`placeholder mismatch for ${key}`);
    }
  }
  return { enKeys: new Set(en.keys()), issues };
}

function getTranslationCallNames(file) {
  const names = new Set(["t", "translateMessage", "tOrFallback"]);
  for (const statement of file.statements) {
    if (!ts.isImportDeclaration(statement)) continue;
    const moduleName = statement.moduleSpecifier.text;
    if (!moduleName.includes("shared/i18n")) continue;
    const bindings = statement.importClause?.namedBindings;
    if (!bindings || !ts.isNamedImports(bindings)) continue;
    for (const element of bindings.elements) {
      if (["t", "translateMessage", "tOrFallback"].includes(element.propertyName?.text || element.name.text)) {
        names.add(element.name.text);
      }
    }
  }
  return names;
}

function isTranslationCall(node, translationCallNames) {
  if (!ts.isCallExpression(node)) return false;
  if (ts.isIdentifier(node.expression)) {
    return translationCallNames.has(node.expression.text);
  }
  return (
    ts.isPropertyAccessExpression(node.expression) &&
    ["t", "translateMessage", "tOrFallback"].includes(node.expression.name.text)
  );
}

function isIgnoredText(node) {
  const parent = node.parent;
  return Boolean(
    parent &&
      (ts.isImportDeclaration(parent) ||
        ts.isExportDeclaration(parent) ||
        ts.isImportSpecifier(parent) ||
        ts.isLiteralTypeNode(parent) ||
        (ts.isPropertyAssignment(parent) &&
          ts.isIdentifier(parent.name) &&
          parent.name.text === "icon")),
  );
}

function isDisplayContext(node) {
  const parent = node.parent;
  if (ts.isJsxText(node)) return true;
  if (ts.isJsxAttribute(parent) && displayAttributeNames.has(parent.name.text)) return true;
  if (ts.isJsxExpression(parent) && parent.expression === node) {
    const container = parent.parent;
    return !ts.isJsxAttribute(container) || displayAttributeNames.has(container.name.text);
  }
  if (ts.isPropertyAssignment(parent) && parent.initializer === node) {
    const name = ts.isIdentifier(parent.name) || ts.isStringLiteral(parent.name)
      ? parent.name.text
      : "";
    return displayPropertyNames.has(name);
  }
  if (ts.isCallExpression(parent) && parent.arguments.includes(node)) {
    const expression = parent.expression;
    const name = ts.isIdentifier(expression)
      ? expression.text
      : ts.isPropertyAccessExpression(expression)
        ? expression.name.text
        : "";
    if (["error", "info", "success", "warning"].includes(name)) {
      const owner = ts.isPropertyAccessExpression(expression)
        ? expression.expression.getText()
        : "";
      return owner === "message" || owner === "notification";
    }
    return displayCallNames.has(name);
  }
  return false;
}

function checkSource(enKeys) {
  const { entries: allowlist, issues } = readAllowlist();
  for (const filePath of walk(srcRoot)) {
    const rel = relative(filePath);
    if (/\.test\.(ts|tsx)$/.test(rel) || rel.startsWith("src/shared/i18n/")) continue;
    const file = sourceFile(filePath);
    const translationCallNames = getTranslationCallNames(file);
    const allowed = allowlist.get(rel) || new Set();
    function report(node, message) {
      issues.push(`${rel}:${lineOf(file, node)} ${message}`);
    }
    function visit(node) {
      if (isTranslationCall(node, translationCallNames) && node.arguments[0]) {
        const firstArgument = node.arguments[0];
        const key = literalText(firstArgument, file);
        const isStaticKey =
          ts.isStringLiteral(firstArgument) ||
          ts.isNoSubstitutionTemplateLiteral(firstArgument);
        if (isStaticKey && key && !enKeys.has(key)) {
          report(node.arguments[0], `unknown translation key ${JSON.stringify(key)}`);
        }
        for (const argument of node.arguments.slice(1)) ts.forEachChild(argument, visit);
        return;
      }
      const text = literalText(node, file);
      const isTranslationArgument =
        node.parent &&
        ts.isCallExpression(node.parent) &&
        isTranslationCall(node.parent, translationCallNames) &&
        node.parent.arguments[0] === node;
      if (text && !isIgnoredText(node) && !isTranslationArgument) {
        if (han.test(text) && !allowed.has(text)) {
          report(node, `hardcoded Han text ${JSON.stringify(text.slice(0, 80))}`);
        }
        if (
          latin.test(text) &&
          isDisplayContext(node) &&
          (text.includes(" ") || ts.isJsxText(node) || ts.isJsxAttribute(node.parent)) &&
          !allowed.has(text) &&
          !text.startsWith("http") &&
          !text.startsWith("/")
        ) {
          report(node, `hardcoded display text ${JSON.stringify(text.slice(0, 80))}`);
        }
      }
      ts.forEachChild(node, visit);
    }
    visit(file);
  }
  return issues;
}

const localeResult = checkLocales();
const issues = [...localeResult.issues, ...checkSource(localeResult.enKeys)];
if (issues.length) {
  console.error(`i18n check found ${issues.length} violation(s):\n${issues.map((issue) => `- ${issue}`).join("\n")}`);
  process.exit(1);
}
console.log("i18n check passed");
