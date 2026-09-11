import { createCodeEditorAppearanceTheme } from "./codeEditorTheme";

it("composites transparent editor colors against the input surface and preserves syntax inheritance", () => {
  const palette: Record<string, string> = {
    "--bg-base": "#ffffff", "--control-input-bg": "rgba(200, 220, 240, 0.5)",
    "--ink": "#123456", "--ink-soft": "#345678", "--control-hover-bg": "rgba(0, 0, 0, 0.1)",
  };
  const result = createCodeEditorAppearanceTheme("light", name => palette[name]);
  expect(result.base).toBe("vs");
  expect(result.inherit).toBe(true);
  expect(result.colors["editor.background"]).toBe("#e4eef8");
  expect(result.colors["editorGutter.background"]).toBe("#e4eef8");
  expect(result.colors["editor.foreground"]).toBe("#123456");
  expect(result.colors["editor.lineHighlightBackground"]).toBe("#cdd6df");
  expect(Object.values(result.colors).every(color => /^#[0-9a-f]{6}$/.test(color))).toBe(true);
});

it("updates the palette when the skin changes without changing light/dark mode", () => {
  const first = createCodeEditorAppearanceTheme("dark", name => name === "--control-input-bg" ? "#203a2b" : "#e3eee4");
  const next = createCodeEditorAppearanceTheme("dark", name => name === "--control-input-bg" ? "#18353e" : "#e4f2f5");
  expect(first.base).toBe("vs-dark");
  expect(next.base).toBe(first.base);
  expect(first.colors["editor.background"]).toBe("#203a2b");
  expect(next.colors["editor.background"]).toBe("#18353e");
  expect(next.colors["editor.foreground"]).toBe("#e4f2f5");
});
