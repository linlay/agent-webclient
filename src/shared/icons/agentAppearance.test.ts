import { defaultAgentIconName, effectiveAgentIcon, resolveAgentIcon } from "./agentAppearance";

it.each([
  ["GENERAL", "general"], ["CODER", "coder"], ["KBASE", "kbase"],
  ["TEAM", "team"], ["EXECUTOR", "executor"], ["PROXY", "proxy"],
])("provides %s creation/display fallback without overriding configured graphics", (mode, name) => {
  expect(defaultAgentIconName(mode)).toBe(name);
  expect(resolveAgentIcon(undefined, mode).name).toBe(name);
  expect(resolveAgentIcon({ name: "proxy", color: "#4370B4" }, mode)).toEqual({ name: "proxy", color: "#4370B4" });
});
it("keeps old built-in names compatible and external images intact", () => {
  expect(resolveAgentIcon({ name: "terminal", color: "purple" }, "GENERAL")).toEqual({ name: "coder", color: "purple" });
  expect(resolveAgentIcon({ name: "library" }, "CODER").name).toBe("kbase");
  expect(effectiveAgentIcon("/assets/avatar.svg", "CODER")).toBe("/assets/avatar.svg");
});
