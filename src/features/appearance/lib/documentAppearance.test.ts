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
    expect(root.style.getPropertyValue("--main-chat-surface")).toBe(resolvedTheme === "dark" ? "rgba(16, 16, 16, 0.72)" : `rgba(${color}, 0.82)`);
    expect(root.style.getPropertyValue("--new-chat-surface")).toBe(resolvedTheme === "dark" ? "rgba(64, 64, 64, 0.06)" : `rgba(${color}, 0.06)`);
    expect(root.style.getPropertyValue("--page-bg")).toBe("transparent");
    target.apply({ resolvedTheme, skin, backgroundMode: "host-fallback" });
    expect(root.style.getPropertyValue("--main-chat-surface")).toBe(root.style.getPropertyValue("--bg-base"));
    expect(root.style.getPropertyValue("--new-chat-surface")).toBe(root.style.getPropertyValue("--bg-base"));
    expect(root.style.getPropertyValue("--page-bg")).toBe("");
  } finally {
    target.dispose();
  }
  expect(root.style.getPropertyValue("--main-chat-surface")).toBe("");
  expect(root.style.getPropertyValue("--new-chat-surface")).toBe("");
});

it.each(["host", "standalone"] as const)("reveals pictures behind management pages even with an opaque skin in %s", backgroundMode => {
  const root = document.documentElement;
  const target = createDocumentAppearanceTarget(root);
  const skin = { id: "photo", tokens: { light: { "--bg-base": "#edf3ed", "--shell-content-bg": "#f6faf2" }, dark: {} } };
  try {
    target.apply({ resolvedTheme: "light", skin, backgroundMode, imageUrl: backgroundMode === "standalone" ? "blob:photo" : undefined });
    expect(root.style.getPropertyValue("--management-page-surface")).toBe("rgba(246, 250, 242, 0.94)");
    expect(root.style.getPropertyValue("--new-chat-surface")).toBe("rgba(246, 250, 242, 0.06)");
    expect(root.style.getPropertyValue("--main-chat-surface")).toBe("rgba(246, 250, 242, 0.82)");
    expect(root.style.getPropertyValue("--bg-base")).toBe("rgb(237, 243, 237)");
    target.apply({ resolvedTheme: "light", skin, backgroundMode: "host-fallback" });
    expect(root.style.getPropertyValue("--management-page-surface")).toBe("rgb(237, 243, 237)");
  } finally { target.dispose(); }
  expect(root.style.getPropertyValue("--management-page-surface")).toBe("");
});
