import { groupSelectedPackages, packageMembers, setPackageSelection } from "./skillPackages";
import type { AgentSkillPackage } from "@/shared/data/api/dto/agents";

const pkg: AgentSkillPackage = { id: "office", name: "Office", version: "1", skills: [{ id: "word" }, { id: "excel" }], missingSkillIds: [], status: "ready" };
const word = { id: "word", name: "Word", configured: false };
const excel = { id: "excel", name: "Excel", configured: false };

test("only resolves actual catalog members, never synthesizes missing skills", () => {
  expect(packageMembers(pkg, [word])).toEqual([word]);
});
test("package selection replaces the previous choice without duplicate IDs or changing locked skills", () => {
  const current = [{ id: "WORD", label: "Word" }, { id: "other", label: "Other" }];
  expect(setPackageSelection(current, [word, excel, excel], true, ["word"])).toEqual([current[0], { id: "excel", label: "Excel" }]);
  expect(setPackageSelection(current, [word, excel], false, ["word"])).toEqual(current);
});
test("grouping leaves individually selected package members as skill chips", () => {
  const current = [{ id: "word", label: "Word" }, { id: "other", label: "Other" }];
  expect(groupSelectedPackages([pkg], current)).toEqual({ groups: [], standalone: current });
});
test("package upgrades cannot add newly available members to a saved selection", () => {
  const current = [{ id: "word", label: "Word", selectedViaPackageId: pkg.id }];
  expect(groupSelectedPackages([pkg], current).groups[0].members).toEqual(current);
});

test("package selection uses Platform localized displayName before legacy name", () => {
  const member = { id: "word", displayName: "文档", name: "Legacy Word", configured: false };
  expect(setPackageSelection([], [member], true, [])).toEqual([{ id: "word", label: "文档" }]);
});

test("same basename in package and standalone remains independently selectable", () => {
  const standalone = { id: "word", displayName: "Word", configured: false };
  const nested = { id: "office/word", name: "word", displayName: "Word", configured: false };
  const nestedPackage = { ...pkg, skills: [{ id: "office/word", name: "word" }] };
  expect(packageMembers(nestedPackage, [standalone, nested])).toEqual([nested]);
  const selected = setPackageSelection([{ id: "word", label: "Word" }], [nested], true, []);
  expect(selected.map(item => item.id)).toEqual(["office/word"]);
  expect(groupSelectedPackages([nestedPackage], selected).standalone).toEqual(selected);
  expect(setPackageSelection(selected, [nested], false, [])).toEqual([]);
});

test("switching between standalone, package and member always replaces the manual choice", () => {
  const other = { id: "other", name: "Other", configured: false };
  let selected = setPackageSelection([], [other], true, []);
  selected = setPackageSelection(selected, [word, excel], true, []);
  expect(selected.map(item => item.id)).toEqual(["word", "excel"]);
  selected = setPackageSelection(selected, [word], true, []);
  expect(selected.map(item => item.id)).toEqual(["word"]);
  selected = setPackageSelection(selected, [excel], true, []);
  expect(selected.map(item => item.id)).toEqual(["excel"]);
  selected = setPackageSelection(selected, [other], true, []);
  expect(selected.map(item => item.id)).toEqual(["other"]);
});


test("explicit package selection groups the chip but preserves concrete member IDs for mustUse", () => {
  const selected = setPackageSelection([], [word, excel], true, [], pkg.id);
  expect(groupSelectedPackages([pkg], selected)).toEqual({ groups: [{ pkg, members: selected }], standalone: [] });
  expect(selected.map(skill => skill.id)).toEqual(["word", "excel"]);
  const member = setPackageSelection(selected, [word], true, []);
  expect(groupSelectedPackages([pkg], member)).toEqual({ groups: [], standalone: member });
});

test("a one-member package is distinct from selecting its sole skill", () => {
  const single = { ...pkg, skills: [{ id: "word" }] };
  const member = setPackageSelection([], [word], true, []);
  expect(groupSelectedPackages([single], member).groups).toEqual([]);
  const whole = setPackageSelection(member, [word], true, [], single.id);
  expect(groupSelectedPackages([single], whole).groups).toEqual([{ pkg: single, members: whole }]);
});
