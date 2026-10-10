import { createAgent, deleteAgent, deleteAdminAgentPrivateSkill, getAdminAgentDetail, getAdminAgentEditorOptions, getAdminAgents, getAgent, getAgentSkills, getAgentOrder, getAgents, getModelOptions, openAgentDirectory, importAdminAgent, importAdminAgentPrivateSkill, updateAgent, updateAgentName, updateAgentModelConfig, putAdminAgentOrder, putAgentOrder } from "@/shared/data/api/requests/agents";
import { setupRequestHarness } from "@/shared/data/__testUtils__/requestHarness";

describe("requests/agents request contracts", () => {
  const { fetchMock } = setupRequestHarness();

  it("sends agent management requests as JSON posts", async () => {
    await createAgent({
      key: "editable-agent",
      definition: {
        key: "editable-agent",
        name: "Editable Agent",
        mode: "REACT",
      },
      soulPrompt: "Soul v1",
      agentsPrompt: "Agents v1",
    });
    await updateAgent({
      key: "editable-agent",
      definition: {
        key: "editable-agent",
        name: "Editable Agent",
        mode: "REACT",
        description: "updated",
      },
    });
    await updateAgentName({
      key: "editable-agent",
      name: "Renamed Agent",
    });
    await updateAgentModelConfig({
      agentKey: "editable-agent",
      modelKey: "coder-model",
      reasoningEffort: "MAX",
    });
    await deleteAgent({ key: "editable-agent" });
    await openAgentDirectory({
      agentKey: "editable-agent",
      directoryType: "config",
    });

    const calls = fetchMock.mock.calls.map(([url, options]) => ({
      url,
      body: JSON.parse(String((options as RequestInit).body || "{}")),
    }));
    expect(calls).toEqual([
      {
        url: "/api/admin/agents/create",
        body: {
          key: "editable-agent",
          definition: {
            key: "editable-agent",
            name: "Editable Agent",
            mode: "REACT",
          },
          soulPrompt: "Soul v1",
          agentsPrompt: "Agents v1",
        },
      },
      {
        url: "/api/admin/agents/update",
        body: {
          key: "editable-agent",
          definition: {
            key: "editable-agent",
            name: "Editable Agent",
            mode: "REACT",
            description: "updated",
          },
        },
      },
      {
        url: "/api/admin/agents/update-name",
        body: {
          key: "editable-agent",
          name: "Renamed Agent",
        },
      },
      {
        url: "/api/agent/model-config",
        body: {
          agentKey: "editable-agent",
          modelKey: "coder-model",
          reasoningEffort: "MAX",
        },
      },
      { url: "/api/admin/agents/delete", body: { key: "editable-agent" } },
      {
        url: "/api/agent/open-directory",
        body: {
          agentKey: "editable-agent",
          directoryType: "config",
        },
      },
    ]);
  });

  it("loads admin agent editor options", async () => {
    await getAdminAgentEditorOptions();

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/admin/agents/editor-options",
      expect.objectContaining({ method: "GET" }),
    );
  });

  it("imports an Agent ZIP without a client-supplied key and only sends overwrite when confirmed", async () => {
    const archive = new File(["zip"], "portable-agent.zip", {
      type: "application/zip",
    });

    await importAdminAgent({ file: archive });
    await importAdminAgent({ file: archive, overwrite: true });

    const [firstUrl, firstOptions] = fetchMock.mock.calls[0] as [
      string,
      RequestInit,
    ];
    expect(firstUrl).toBe("/api/admin/agents/import");
    expect(firstOptions.method).toBe("POST");
    expect(firstOptions.headers).toEqual({ "X-Locale": "zh-CN" });
    expect(firstOptions.body).toBeInstanceOf(FormData);
    const firstForm = firstOptions.body as FormData;
    expect(firstForm.get("file")).toBe(archive);
    expect(firstForm.get("overwrite")).toBeNull();
    expect(firstForm.get("key")).toBeNull();
    expect(firstForm.get("agentKey")).toBeNull();

    const [retryUrl, retryOptions] = fetchMock.mock.calls[1] as [
      string,
      RequestInit,
    ];
    expect(retryUrl).toBe("/api/admin/agents/import");
    const retryForm = retryOptions.body as FormData;
    expect(retryForm.get("file")).toBe(archive);
    expect(retryForm.get("overwrite")).toBe("true");
  });

  it("imports and deletes an Agent-private skill through the Agent admin routes", async () => {
    const archive = new File(["zip"], "private.zip", {
      type: "application/zip",
    });
    await importAdminAgentPrivateSkill({
      agentKey: "demo-agent",
      file: archive,
    });
    await deleteAdminAgentPrivateSkill({
      agentKey: "demo-agent",
      id: "private-skill",
    });

    const [importUrl, importOptions] = fetchMock.mock.calls[0] as [
      string,
      RequestInit,
    ];
    expect(importUrl).toBe("/api/admin/agents/skills/import");
    expect(importOptions.method).toBe("POST");
    expect(importOptions.body).toBeInstanceOf(FormData);
    const formData = importOptions.body as FormData;
    expect(formData.get("agentKey")).toBe("demo-agent");
    expect(formData.get("id")).toBeNull();
    expect(formData.get("file")).toBe(archive);
    expect(formData.get("confirmCenterOverride")).toBeNull();

    const [deleteUrl, deleteOptions] = fetchMock.mock.calls[1] as [
      string,
      RequestInit,
    ];
    expect(deleteUrl).toBe("/api/admin/agents/skills/delete");
    expect(JSON.parse(String(deleteOptions.body))).toEqual({
      agentKey: "demo-agent",
      id: "private-skill",
    });
  });

  it("loads global model options", async () => {
    await getModelOptions();

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/model-options",
      expect.objectContaining({ method: "GET" }),
    );
  });

  it("requests a single agent by agentKey query param", async () => {
    await getAgent("demo-agent");

    expect((fetchMock.mock.calls[0] as [string, RequestInit])[0]).toBe(
      "/api/agent?agentKey=demo-agent",
    );
  });

  it("requests the slash skill catalog for one agent", async () => {
    await getAgentSkills("mock-agent");

    expect((fetchMock.mock.calls[0] as [string, RequestInit])[0]).toBe(
      "/api/skills?agentKey=mock-agent",
    );
  });

  it("keeps getAgents queryless by default and forwards mixed-list filters", async () => {
    await getAgents();
    await getAgents({ includeChats: 5 });
    await getAgents({
      includeChats: 5,

      scope: "copilot",
      mode: "CODER",
    });
    await getAgents({
      includeChats: 20,
      scope: "nav",
      mode: ["CODER", "KBASE"],
    });

    expect((fetchMock.mock.calls[0] as [string, RequestInit])[0]).toBe(
      "/api/agents",
    );
    expect((fetchMock.mock.calls[1] as [string, RequestInit])[0]).toBe(
      "/api/agents?includeChats=5",
    );
    expect((fetchMock.mock.calls[2] as [string, RequestInit])[0]).toBe(
      "/api/agents?includeChats=5&scope=copilot&mode=CODER",
    );
    expect((fetchMock.mock.calls[3] as [string, RequestInit])[0]).toBe(
      "/api/agents?includeChats=20&scope=nav&mode=CODER&mode=KBASE",
    );
  });

  it.each([true, false])("forwards hasWorkspace=%s without adding a mode filter", async (hasWorkspace) => {
    await getAgents({ hasWorkspace, includeChats: 20, scope: "nav" });

    expect(fetchMock.mock.calls[0][0]).toBe(
      `/api/agents?includeChats=20&hasWorkspace=${hasWorkspace}&scope=nav`,
    );
  });

  it("supports reading and writing agent order", async () => {
    await getAgentOrder();
    await putAgentOrder({ order: ["agent-b", "agent-a"] });

    expect((fetchMock.mock.calls[0] as [string, RequestInit])[0]).toBe(
      "/api/agents/order",
    );
    expect((fetchMock.mock.calls[0] as [string, RequestInit])[1].method).toBe(
      "GET",
    );
    expect((fetchMock.mock.calls[1] as [string, RequestInit])[0]).toBe(
      "/api/agents/order",
    );
    expect((fetchMock.mock.calls[1] as [string, RequestInit])[1]).toMatchObject(
      {
        method: "PUT",
        body: JSON.stringify({ order: ["agent-b", "agent-a"] }),
      },
    );
  });

  it("uses admin endpoints for management agent discovery, detail, and order updates", async () => {
    await getAdminAgents();
    await getAdminAgentDetail("bad-agent");
    await putAdminAgentOrder({ order: ["bad-agent", "agent-a"] });

    expect((fetchMock.mock.calls[0] as [string, RequestInit])[0]).toBe(
      "/api/admin/agents",
    );
    expect((fetchMock.mock.calls[1] as [string, RequestInit])[0]).toBe(
      "/api/admin/agent?agentKey=bad-agent",
    );
    expect((fetchMock.mock.calls[2] as [string, RequestInit])[0]).toBe(
      "/api/admin/agents/order",
    );
    expect((fetchMock.mock.calls[2] as [string, RequestInit])[1]).toMatchObject(
      {
        method: "PUT",
        body: JSON.stringify({ order: ["bad-agent", "agent-a"] }),
      },
    );
  });
});
