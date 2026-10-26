import { EMPTY_FORM, buildIconValue, iconFieldsFromValue, buildDefinition, formFromDetail } from "./agentDefinition";
import type { Translate } from "./agentDefinition";
const t = ((key: string) => key) as Translate;

it("round-trips independent icon name and color through the definition used for agent.yml", () => {
  const original = { key: "worker", name: "Worker", mode: "CODER", icon: { name: "proxy", color: "#358E8A" } };
  const form = formFromDetail({ ...original, definition: original } as any);
  expect(form.iconName).toBe("proxy"); expect(form.iconColor).toBe("#358E8A");
  const saved = buildDefinition({ ...form, mode: "KBASE" }, original, t);
  expect(saved.mode).toBe("KBASE"); expect(saved.icon).toEqual(original.icon);
});
it("allows clearing a color without losing the selected graphic", () => {
  const fields = iconFieldsFromValue({ name: "coder", color: "#4370B4" });
  expect(buildIconValue({ ...EMPTY_FORM, ...fields, iconColor: "" })).toEqual({ name: "coder" });
});
it("canonicalizes old names on explicit save and retains their configured color", () => {
  const fields = iconFieldsFromValue({ name: "terminal", color: "#4370B4" });
  expect(buildIconValue({ ...EMPTY_FORM, ...fields, mode: "GENERAL" })).toEqual({ name: "coder", color: "#4370B4" });
});
it("preserves image icons and fills a selected built-in's missing name from the mode", () => {
  const fields = iconFieldsFromValue("/icons/custom.svg");
  expect(buildIconValue({ ...EMPTY_FORM, ...fields })).toBe("/icons/custom.svg");
  expect(buildIconValue({ ...EMPTY_FORM, iconKind: "builtin", mode: "TEAM", iconColor: "#8D64A9" }))
    .toEqual({ name: "team", color: "#8D64A9" });
});
