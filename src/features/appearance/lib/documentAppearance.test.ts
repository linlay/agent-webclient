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
