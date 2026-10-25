import { orderConnectorsBuiltinLast } from "./connectorSelection";

it("reserves the first three slots for external connectors before builtin fallbacks without mutating the catalog", () => {
  const ids = ["builtin.kanban-control", "builtin.kbase-control", "builtin.platform-control", "datascope", "jira"];
  const catalog = ids.map(id => ({ id }));
  const ordered = orderConnectorsBuiltinLast(catalog);
  expect(ordered.map(item => item.id)).toEqual([
    "datascope", "jira", "builtin.kanban-control", "builtin.kbase-control", "builtin.platform-control",
  ]);
  expect(ordered.slice(0, 3).map(item => item.id)).toEqual(["datascope", "jira", "builtin.kanban-control"]);
  expect(catalog.map(item => item.id)).toEqual(ids);
});
