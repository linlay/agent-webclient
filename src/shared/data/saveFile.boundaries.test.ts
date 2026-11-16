import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
it("keeps browser download creation inside the shared save helper", () => {
  const violations: string[] = [];
  function scan(directory: string) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const file = path.join(directory, entry.name);
      // Public share pages are a separate Standalone-only renderer.
      if (entry.isDirectory()) { if (entry.name !== "export") scan(file); continue; }
      if (!/\.tsx?$/.test(file) || /\.test\.tsx?$/.test(file) || file.endsWith(`${path.sep}saveFile.ts`)) continue;
      const source = ts.createSourceFile(file, fs.readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true);
      function visit(node: ts.Node) {
        const assignment = ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.EqualsToken && ts.isPropertyAccessExpression(node.left) && node.left.name.text === "download";
        const attribute = ts.isJsxAttribute(node) && node.name.getText(source) === "download";
        const setter = ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) && node.expression.name.text === "setAttribute" && node.arguments[0] && ts.isStringLiteral(node.arguments[0]) && node.arguments[0].text === "download";
        if (assignment || attribute || setter) violations.push(path.relative(process.cwd(), file));
        ts.forEachChild(node, visit);
      }
      visit(source);
    }
  }
  scan(path.join(process.cwd(), "src"));
  expect(violations).toEqual([]);
});
