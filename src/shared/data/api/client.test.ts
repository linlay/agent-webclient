import {
  getMemoryRecord,
  getMemoryRecords,
  getMemoryMeta,
  getMemoryScope,
  getMemoryScopes,
  previewMemoryContext,
  saveMemoryScope,
  validateMemoryScope,
} from "@/shared/data/api/requests/memory";
import { setupRequestHarness } from "@/shared/data/__testUtils__/requestHarness";

describe("memory request contracts", () => {
  const { fetchMock } = setupRequestHarness();

  it("requests memory records and detail over HTTP query params", async () => {
    await getMemoryRecords({
      agentKey: "agent-a",
      keyword: "bugfix",
      kind: "fact",
      scopeType: "agent",
      status: "active",
      category: "general",
      limit: 15,
    });
    await getMemoryRecord("agent-a", "mem_101");

    expect((fetchMock.mock.calls[0] as [string, RequestInit])[0]).toBe(
      "/api/memory/record/list?agentKey=agent-a&keyword=bugfix&kind=fact&scopeType=agent&status=active&category=general&limit=15",
    );
    expect((fetchMock.mock.calls[1] as [string, RequestInit])[0]).toBe(
      "/api/memory/record/detail?agentKey=agent-a&recordId=mem_101",
    );
  });

  it("requests memory scopes, scope detail, validate, and save over HTTP", async () => {
    await getMemoryScopes("agent-a");
    await getMemoryMeta();
    await getMemoryScope("agent-a", "agent", "agent:agent-a");
    await validateMemoryScope("agent-a", "agent", "# AGENT");
    await previewMemoryContext({
      chatId: "chat-preview",
      message: "desktop builtin 发布流程",
    });
    await saveMemoryScope({
      agentKey: "agent-a",
      scopeType: "agent",
      scopeKey: "agent:agent-a",
      mode: "records",
      archiveMissing: true,
      records: [
        {
          id: "mem_1",
          title: "偏好中文输出",
          summary: "Prefer Chinese output.",
          category: "general",
          importance: 8,
          confidence: 0.95,
          tags: ["preference"],
        },
      ],
    });

    expect((fetchMock.mock.calls[0] as [string, RequestInit])[0]).toBe(
      "/api/memory/scope/list?agentKey=agent-a",
    );
    expect((fetchMock.mock.calls[1] as [string, RequestInit])[0]).toBe(
      "/api/memory/meta",
    );
    expect((fetchMock.mock.calls[2] as [string, RequestInit])[0]).toBe(
      "/api/memory/scope/detail?agentKey=agent-a&scopeType=agent&scopeKey=agent%3Aagent-a",
    );
    expect((fetchMock.mock.calls[3] as [string, RequestInit])[0]).toBe(
      "/api/memory/scope/validate",
    );
    expect(
      JSON.parse(
        String((fetchMock.mock.calls[3] as [string, RequestInit])[1].body),
      ),
    ).toEqual({
      agentKey: "agent-a",
      scopeType: "agent",
      markdown: "# AGENT",
    });
    expect((fetchMock.mock.calls[4] as [string, RequestInit])[0]).toBe(
      "/api/memory/context-preview",
    );
    expect(
      JSON.parse(
        String((fetchMock.mock.calls[4] as [string, RequestInit])[1].body),
      ),
    ).toEqual({
      chatId: "chat-preview",
      message: "desktop builtin 发布流程",
    });
    expect((fetchMock.mock.calls[5] as [string, RequestInit])[0]).toBe(
      "/api/memory/scope/save",
    );
    expect(
      JSON.parse(
        String((fetchMock.mock.calls[5] as [string, RequestInit])[1].body),
      ),
    ).toEqual({
      agentKey: "agent-a",
      scopeType: "agent",
      scopeKey: "agent:agent-a",
      mode: "records",
      archiveMissing: true,
      records: [
        {
          id: "mem_1",
          title: "偏好中文输出",
          summary: "Prefer Chinese output.",
          category: "general",
          importance: 8,
          confidence: 0.95,
          tags: ["preference"],
        },
      ],
    });
  });
});
