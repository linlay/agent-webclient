const fs = require("node:fs");
const ts = require("typescript");
const path = require("node:path");

// Audit emitted modules, including concatenated and asynchronous dependencies.
// Type-only imports have already disappeared from this graph.
function checkExportModules(root, modules) {
  if (!modules.includes("src/export/index.tsx") || !modules.includes("src/export/html-preview-bootstrap.ts")) {
    throw new Error("Conversation export graph is missing an entry point.");
  }
  for (const name of modules) {
    if (/^src\/(?:app\/|shared\/data\/)|\/(?:useAuthenticatedResourceUrl|useAppMessage|useOpenTarget|runRuntimeState)\.[jt]sx?$/u.test(name)) {
      throw new Error(`Conversation export includes an application capability: ${name}`);
    }
    if (!/^src\/.*\.[jt]sx?$/u.test(name)) continue;
    const source = fs.readFileSync(path.join(root, name), "utf8");
    const ast = ts.createSourceFile(name, source, ts.ScriptTarget.Latest, true, name.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
    const inspect = (node) => {
      if (ts.isCallExpression(node) || ts.isNewExpression(node)) {
        const expression = node.expression;
        const called = ts.isIdentifier(expression) ? expression.text
          : ts.isPropertyAccessExpression(expression) ? expression.name.text : "";
        if (["XMLHttpRequest", "WebSocket", "EventSource"].includes(called) ||
          (called === "fetch" && name !== "src/export/ShareHtmlPreview.tsx")) {
          throw new Error(`Conversation export includes an unexpected network client: ${name}`);
        }
      }
      ts.forEachChild(node, inspect);
    };
    inspect(ast);
  }
}
module.exports = { checkExportModules };
