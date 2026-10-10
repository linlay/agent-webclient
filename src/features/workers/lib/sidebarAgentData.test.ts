import { getAgents } from "@/shared/data";
import { readSidebarAgents } from "./sidebarAgentData";
jest.mock("@/shared/data", () => ({ getAgents: jest.fn() }));
const request = jest.mocked(getAgents);

it("loads the general picker and all workspace projects without excluding KBASE projects", async () => {
  request.mockImplementation(async options => ({ code: 0, msg: "", data: options?.hasWorkspace
    ? [{ key: "docs", name: "Docs", mode: "KBASE", workspaceDir: "/docs" }]
    : [{ key: "helper", name: "Helper" }] }));
  const rows = await readSidebarAgents({ includeChats: 5, chatsPinned: false });
  expect(request.mock.calls.map(call => call[0])).toEqual([
    { includeChats: 5, chatsPinned: false, scope: "nav",  hasWorkspace: false },
    { includeChats: 5, chatsPinned: false, scope: undefined,  hasWorkspace: true },
  ]);
  expect(rows.map(row => row.key)).toEqual(["helper", "docs"]);
});
