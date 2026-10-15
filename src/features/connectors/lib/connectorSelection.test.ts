import { BUILTIN_CONNECTOR_IDS, orderConnectorsBuiltinLast } from "./connectorSelection";

describe("orderConnectorsBuiltinLast", () => {
  it("moves Platform builtin connectors after user connectors and keeps relative order", () => {
    const items = [
      { id: "builtin.web-control" },
      { id: "user.jira" },
      { id: "builtin.dbx" },
      { id: "user.github" },
      { id: "builtin.task-control" },
    ];

    expect(orderConnectorsBuiltinLast(items).map(item => item.id)).toEqual([
      "user.jira",
      "user.github",
      "builtin.web-control",
      "builtin.dbx",
      "builtin.task-control",
    ]);
  });

  it("returns a new array and keeps input unchanged", () => {
    const items = [{ id: "builtin.httpx" }, { id: "user.a" }];
    const result = orderConnectorsBuiltinLast(items);

    expect(result).not.toBe(items);
    expect(items.map(item => item.id)).toEqual(["builtin.httpx", "user.a"]);
  });

  it("lists the seven builtin connector IDs known to agent-platform", () => {
    expect([...BUILTIN_CONNECTOR_IDS].sort()).toEqual([
      "builtin.dbx",
      "builtin.httpx",
      "builtin.kanban-control",
      "builtin.kbase-control",
      "builtin.platform-control",
      "builtin.task-control",
      "builtin.web-control",
    ]);
  });
});
