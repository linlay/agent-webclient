import { getAgentFile, getProjectChanges, getProjectDiff, getProjectTree, getProjectGit, getProjectGitBranches, changeProjectGitBranch, getFileHistory } from "@/shared/data/api/requests/projects";
import { setupRequestHarness } from "@/shared/data/__testUtils__/requestHarness";

describe("requests/projects request contracts", () => {
  const { fetchMock } = setupRequestHarness();

  it("requests an agent workspace file with the typed file endpoint", async () => {
    await getAgentFile({
      agentKey: "coder-agent",
      path: "/Users/demo/project/Dockerfile",
      encoding: "utf-8",
    });

    expect((fetchMock.mock.calls[0] as [string, RequestInit])[0]).toBe(
      "/api/file?agentKey=coder-agent&path=%2FUsers%2Fdemo%2Fproject%2FDockerfile&encoding=utf-8",
    );
  });

  it("requests a KBASE file without requiring a frontend workspace root", async () => {
    await getAgentFile({
      agentKey: "knowledge-agent",
      path: "docs/guide.md",
    });

    expect((fetchMock.mock.calls[0] as [string, RequestInit])[0]).toBe(
      "/api/file?agentKey=knowledge-agent&path=docs%2Fguide.md",
    );
  });

  it("loads local branches separately and posts the explicit branch mutation", async () => {
    await getProjectGitBranches("knowledge");
    await changeProjectGitBranch({
      agentKey: "knowledge",
      operation: "create",
      branch: "feature/new",
      expectedRevision: "revision",
    });
    expect(fetchMock.mock.calls[0][0]).toBe(
      "/api/project/git/branches?agentKey=knowledge",
    );
    const [url, options] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(url).toBe("/api/project/git/branches");
    expect(options.method).toBe("POST");
    expect(JSON.parse(options.body as string)).toEqual({
      agentKey: "knowledge",
      operation: "create",
      branch: "feature/new",
      expectedRevision: "revision",
    });
  });

  it("requests live Git state independently with abort and no HTTP cache", async () => {
    const controller = new AbortController();
    await getProjectGit("knowledge agent", { signal: controller.signal });
    const [url, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/project/git?agentKey=knowledge+agent");
    expect(options.signal).toBe(controller.signal);
    expect(options.cache).toBe("no-store");
  });

  it("requests project tree, changes, and diff over fixed HTTP endpoints", async () => {
    await getProjectTree({
      agentKey: "coder-agent",
      path: "src/lib",
      cursor: "cursor one",
      limit: 200,
    });
    await getProjectChanges({
      agentKey: "coder-agent",
      chatId: "chat-1",
      runId: "run-2",
      limit: 1000,
    });
    await getProjectDiff({
      agentKey: "coder-agent",
      chatId: "chat-1",
      runId: "run-2",
      path: "src/App.tsx",
      encoding: "utf-8",
    });

    expect((fetchMock.mock.calls[0] as [string, RequestInit])[0]).toBe(
      "/api/project/tree?agentKey=coder-agent&path=src%2Flib&cursor=cursor+one&limit=200",
    );
    expect((fetchMock.mock.calls[1] as [string, RequestInit])[0]).toBe(
      "/api/project/changes?agentKey=coder-agent&chatId=chat-1&runId=run-2&limit=1000",
    );
    expect((fetchMock.mock.calls[2] as [string, RequestInit])[0]).toBe(
      "/api/project/diff?agentKey=coder-agent&chatId=chat-1&runId=run-2&path=src%2FApp.tsx&encoding=utf-8",
    );
  });

  it("normalizes legacy null project collections to empty arrays", async () => {
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({
            code: 0,
            msg: "ok",
            data: {
              agentKey: "coder-agent",
              mode: "CODER",
              workspaceName: "demo",
              path: "",
              revision: "tree-revision",
              entries: null,
            },
          }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({
            code: 0,
            msg: "ok",
            data: {
              agentKey: "coder-agent",
              chatId: "chat-1",
              revision: "changes-revision",
              runs: null,
              items: null,
            },
          }),
      });

    const tree = await getProjectTree({ agentKey: "coder-agent" });
    const changes = await getProjectChanges({
      agentKey: "coder-agent",
      chatId: "chat-1",
    });

    expect(tree.data.entries).toEqual([]);
    expect(changes.data.runs).toEqual([]);
    expect(changes.data.items).toEqual([]);
  });

  it("requests file history with encoded path and version", async () => {
    await getFileHistory({
      chatId: "chat_1",
      runId: "run_1",
      filePath: "/workspace/src/App.tsx",
      version: "current",
    });

    expect((fetchMock.mock.calls[0] as [string, RequestInit])[0]).toBe(
      "/api/file/history?chatId=chat_1&runId=run_1&filePath=%2Fworkspace%2Fsrc%2FApp.tsx&version=current",
    );
  });
});
