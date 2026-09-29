import { groupSelectedPackages, packageMembers, setPackageSelection } from "./skillPackages";
import type { AgentSkillPackage } from "@/shared/data/api/dto/agents";

const pkg: AgentSkillPackage = { id: "office", name: "Office", version: "1", skills: [{ id: "word" }, { id: "excel" }], missingSkillIds: [], status: "ready" };
const word = { key: "word", name: "Word", configured: false };
const excel = { key: "excel", name: "Excel", configured: false };

test("only resolves actual catalog members, never synthesizes missing skills", () => {
  expect(packageMembers(pkg, [word])).toEqual([word]);
});
test("bulk selection merges without duplicate IDs or changing locked skills", () => {
  const current = [{ key: "WORD", label: "Word" }, { key: "other", label: "Other" }];
  expect(setPackageSelection(current, [word, excel, excel], true, ["word"])).toEqual([...current, { key: "excel", label: "Excel" }]);
  expect(setPackageSelection(current, [word, excel], false, ["word"])).toEqual(current);
});
test("grouping folds only selected members into a package and preserves standalone selections", () => {
  const current = [{ key: "word", label: "Word" }, { key: "other", label: "Other" }];
  expect(groupSelectedPackages([pkg], current)).toEqual({ groups: [{ pkg, members: [current[0]] }], standalone: [current[1]] });
});
test("package upgrades cannot add newly available members to a saved selection", () => {
  expect(groupSelectedPackages([pkg], [{ key: "word", label: "Word" }]).groups[0].members).toHaveLength(1);
});

test("package selection uses Platform localized displayName before legacy name", () => {
  const member = { key: "word", displayName: "文档", name: "Legacy Word", configured: false };
  expect(setPackageSelection([], [member], true, [])).toEqual([{ key: "word", label: "文档" }]);
});

test("same basename in package and standalone remains independently selectable", () => {
  const standalone = { key: "word", displayName: "Word", configured: false };
  const nested = { key: "office/word", name: "word", displayName: "Word", configured: false };
  const nestedPackage = { ...pkg, skills: [{ id: "office/word", name: "word" }] };
  expect(packageMembers(nestedPackage, [standalone, nested])).toEqual([nested]);
  const selected = setPackageSelection([{ key: "word", label: "Word" }], [nested], true, []);
  expect(selected.map(item => item.key)).toEqual(["word", "office/word"]);
  expect(groupSelectedPackages([nestedPackage], selected).standalone.map(item => item.key)).toEqual(["word"]);
  expect(setPackageSelection(selected, [nested], false, []).map(item => item.key)).toEqual(["word"]);
});
