import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import fs from "fs";
import path from "path";

import {
  getMaterialIconHref,
  getMaterialIconSymbolId,
  MaterialIcon,
  MATERIAL_ICON_NAMES,
  materialIconSymbolIds,
  resolveMaterialIconName,
} from "./material";

describe("MaterialIcon", () => {
  it("exposes the material icon names used by the app", () => {
    expect(MATERIAL_ICON_NAMES).toContain("add");
    expect(MATERIAL_ICON_NAMES).toContain("progress_activity");
    expect(MATERIAL_ICON_NAMES).toContain("dark_mode");
    expect(MATERIAL_ICON_NAMES).toContain("light_mode");
    expect(MATERIAL_ICON_NAMES).not.toContain("material_symbols_font");
  });

  it("renders an external sprite-backed svg icon", () => {
    const html = renderToStaticMarkup(
      React.createElement(MaterialIcon, { name: "add", className: "extra" }),
    );

    expect(html).toContain('class="material-icon extra"');
    expect(html).toContain('data-material-icon="add"');
    expect(html).toContain("<svg");
    expect(html).toContain("<use");
    expect(html).toContain("svg-mock.svg#material-symbol-add");
  });

  it("resolves unknown dynamic icon names explicitly", () => {
    expect(resolveMaterialIconName("does_not_exist")).toBe("help");
  });

  it("keeps registry ids and the static sprite asset in sync", () => {
    const sprite = fs.readFileSync(
      path.join(__dirname, "material", "sprite.svg"),
      "utf8",
    );
    const symbolIds = new Set(Object.values(materialIconSymbolIds));

    expect(MATERIAL_ICON_NAMES).toHaveLength(
      Object.keys(materialIconSymbolIds).length,
    );
    expect(symbolIds.size).toBe(MATERIAL_ICON_NAMES.length);
    expect(getMaterialIconSymbolId("draft")).toBe("material-symbol-drafts");
    expect(getMaterialIconSymbolId("question_answer")).toBe(
      "material-symbol-forum",
    );
    expect(sprite).not.toContain("material-icon-outlined");
    expect(sprite).not.toContain("transform=");
    expect(sprite).not.toContain("style=");
    for (const name of MATERIAL_ICON_NAMES) {
      expect(getMaterialIconHref(name)).toBe(
        `svg-mock.svg#${getMaterialIconSymbolId(name)}`,
      );
    }
    for (const id of symbolIds) {
      expect(sprite).toContain(`id="${id}"`);
    }
  });

  it("covers every static MaterialIcon name used by source files", () => {
    const srcRoot = path.resolve(__dirname, "..", "..");
    const files: string[] = [];
    const visit = (directory: string) => {
      for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
        const current = path.join(directory, entry.name);
        if (entry.isDirectory()) {
          visit(current);
        } else if (/\.(ts|tsx)$/.test(entry.name)) {
          files.push(current);
        }
      }
    };
    visit(srcRoot);

    const missing = files.flatMap((file) => {
      const source = fs.readFileSync(file, "utf8");
      return [...source.matchAll(/<MaterialIcon\s+[^>]*name="([^"]+)"/g)]
        .map((match) => match[1])
        .filter((name) => !MATERIAL_ICON_NAMES.includes(name as never))
        .map((name) => `${path.relative(srcRoot, file)}:${name}`);
    });

    expect(missing).toEqual([]);
  });
});
