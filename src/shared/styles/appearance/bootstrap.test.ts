import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import ts from "typescript";
import { resolveBootAppearance } from "./bootstrap";

it.each([
  ["?hostTheme=dark", false, "light", false, "dark"],
  ["?theme=light&hostTheme=dark", true, "dark", true, "light"],
  ["?theme=bad&hostTheme=dark", false, "light", false, "dark"],
  ["?hostTheme=invalid", false, "dark", false, "dark"],
  ["", false, "system", true, "dark"],
  ["", false, "light", true, "light"],
  ["", true, "light", true, "dark"],
  ["", true, "dark", false, "light"],
  ["", false, "broken", false, "light"],
])("resolves URL/system/preferences consistently: %s desktop %s stored %s", (search, desktop, storedTheme, systemDark, expected) => {
  expect(resolveBootAppearance({ search: search as string, desktop: desktop as boolean, storedTheme, systemDark: systemDark as boolean }).resolvedTheme).toBe(expected);
});
it("executes the exact first-paint module with blocked storage and runtime config already loaded", () => {
  const script = ts.transpileModule(fs.readFileSync(path.join(__dirname, "bootstrap.ts"), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  const dataset: Record<string, string> = {};
  const context = vm.createContext({ exports: {}, URLSearchParams, window: { location: { search: "?hostTheme=dark" } }, document: { documentElement: { dataset } }, localStorage: { getItem() { throw new Error("denied"); } }, __AGENT_WEBCLIENT_RUNTIME_CONFIG__: { DESKTOP_APP: "true" } });
  vm.runInContext(`${script}; exports.applyBootAppearance();`, context);
  expect(dataset).toEqual({ theme: "dark", pageBackground: "host-fallback" });
  const template = fs.readFileSync(path.join(__dirname, "../../../../public/index.html"), "utf8");
  expect(template.indexOf("runtime-config.js")).toBeLessThan(template.indexOf("appearanceBootstrap"));
});
