/** @jest-environment jsdom */
import { createDocumentAppearanceTarget, opaqueColor, readableSurface } from "./documentAppearance";
it("keeps picture reading surfaces legible without making bg-base transparent", () => {
  expect(opaqueColor("#0008", "#fff")).toBe("rgb(119, 119, 119)");
  expect(opaqueColor("rgba(0, 0, 0, 0)", "#ffffff")).toBe("rgb(255, 255, 255)");
  expect(readableSurface("rgba(20, 40, 30, 0.35)", "#ffffff")).toBe("rgba(20, 40, 30, 0.9)");
  expect(readableSurface("rgba(20, 40, 30, 0.98)", "#ffffff")).toBe("rgba(20, 40, 30, 0.98)");
});
it("cleans only its own document properties and restores inline values on release", () => {
  const root = document.documentElement;
  root.style.setProperty("--accent", "#123456", "important");
  root.style.setProperty("--unrelated", "kept");
  root.dataset.theme = "light";
  const target = createDocumentAppearanceTarget(root);
  target.apply({ resolvedTheme: "dark", skin: { id: "mist", tokens: { light: {}, dark: { "--accent": "#83c79a" } } }, backgroundMode: "host" });
  expect(root.style.getPropertyValue("--page-bg")).toBe("transparent");
  expect(root.style.getPropertyValue("--bg-base")).not.toBe("transparent");
  target.apply({ resolvedTheme: "light", skin: { id: "default", tokens: { light: {}, dark: {} } }, backgroundMode: "host-fallback" });
  expect(root.style.getPropertyValue("--page-bg")).toBe("");
  expect(root.style.getPropertyValue("--accent")).toBe("#123456");
  target.dispose();
  expect(root.style.getPropertyPriority("--accent")).toBe("important");
  expect(root.style.getPropertyValue("--unrelated")).toBe("kept");
  expect(root.dataset.theme).toBe("light");
  root.removeAttribute("style");
});

it.each(["light", "dark"] as const)("keeps a continuous faint host background in %s and removes it on fallback", (resolvedTheme) => {
  const root = document.documentElement;
  const target = createDocumentAppearanceTarget(root);
  const color = resolvedTheme === "light" ? "246, 250, 242" : "20, 39, 29";
  const skin = { id: "photo", tokens: { light: { "--shell-content-bg": `rgba(${color}, 0.25)` }, dark: { "--shell-content-bg": `rgba(${color}, 0.25)` } } };
  try {
    target.apply({ resolvedTheme, skin, backgroundMode: "host" });
    expect(root.style.getPropertyValue("--main-chat-surface")).toBe(`rgba(${color}, 0.94)`);
    expect(root.style.getPropertyValue("--page-bg")).toBe("transparent");
    target.apply({ resolvedTheme, skin, backgroundMode: "host-fallback" });
    expect(root.style.getPropertyValue("--main-chat-surface")).toBe(root.style.getPropertyValue("--bg-base"));
    expect(root.style.getPropertyValue("--page-bg")).toBe("");
  } finally {
    target.dispose();
  }
  expect(root.style.getPropertyValue("--main-chat-surface")).toBe("");
});
