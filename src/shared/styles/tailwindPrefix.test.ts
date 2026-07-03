import fs from "node:fs";
import path from "node:path";

const SOURCE_ROOTS = ["src/app", "src/features", "src/shared"];
const SOURCE_EXTENSIONS = new Set([".js", ".jsx", ".ts", ".tsx"]);

function collectSourceFiles(dir: string): string[] {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  return entries.flatMap((entry) => {
    const entryPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      return collectSourceFiles(entryPath);
    }
    if (!SOURCE_EXTENSIONS.has(path.extname(entry.name))) {
      return [];
    }
    if (/\.test\.[jt]sx?$/.test(entry.name)) {
      return [];
    }
    return [entryPath];
  });
}

function findMisorderedPrefixedTailwindClasses(source: string): string[] {
  return source
    .split(/[\s"'`]+/)
    .filter((token) => token.includes(":tw:") && !token.startsWith("tw:"));
}

describe("Tailwind prefix conventions", () => {
  it("keeps variant modifiers after the tw prefix", () => {
    const offenders = SOURCE_ROOTS.flatMap((root) =>
      collectSourceFiles(path.join(process.cwd(), root)).flatMap((file) =>
        findMisorderedPrefixedTailwindClasses(
          fs.readFileSync(file, "utf8"),
        ).map((token) => `${path.relative(process.cwd(), file)}: ${token}`),
      ),
    );

    expect(offenders).toEqual([]);
  });
});
