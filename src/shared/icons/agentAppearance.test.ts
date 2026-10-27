import { defaultAgentIconName, effectiveAgentIcon, normalizeAgentIconName, resolveAgentIcon } from "./agentAppearance";

it.each([
  ["GENERAL", "general"], ["CODER", "coder"], ["KBASE", "kbase"],
  ["TEAM", "team"], ["EXECUTOR", "executor"], ["PROXY", "proxy"],
])("provides %s creation/display fallback without overriding configured graphics", (mode, name) => {
  expect(defaultAgentIconName(mode)).toBe(name);
  expect(resolveAgentIcon(undefined, mode).name).toBe(name);
  expect(resolveAgentIcon({ name: "proxy", color: "#4370B4" }, mode)).toEqual({ name: "proxy", color: "#4370B4" });
});
it("retires old built-in names while keeping external images intact", () => {
  expect(resolveAgentIcon({ name: "terminal", color: "purple" }, "GENERAL")).toEqual({ name: "general", color: "purple" });
  expect(resolveAgentIcon({ name: "library" }, "CODER").name).toBe("coder");
  expect(effectiveAgentIcon("/assets/avatar.svg", "CODER")).toBe("/assets/avatar.svg");
});

it.each(["terminal", "ternimal", "library", "folder", "default", "portal", "code", "knowledge", "bolt", "radar"])("does not resolve retired icon name %s", name => {
  expect(normalizeAgentIconName(name)).toBeUndefined();
});
