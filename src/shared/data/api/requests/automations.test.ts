import { createAutomation, deleteAutomation, getAutomation, getAutomationExecution, getAutomationExecutions, getAutomations, toggleAutomation, triggerAutomation, updateAutomation } from "@/shared/data/api/requests/automations";
import { setupRequestHarness } from "@/shared/data/__testUtils__/requestHarness";

describe("requests/automations request contracts", () => {
  const { fetchMock } = setupRequestHarness();

  it("sends automation management requests as JSON posts", async () => {
    await getAutomations();
    await getAutomation("daily-demo");
    await createAutomation({
      name: "Daily Demo",
      description: "Demo automation",
      cron: "0 9 * * *",
      agentKey: "demo-agent",
      enabled: true,
      query: { message: "hello", role: "user" },
    });
    await updateAutomation({
      id: "daily-demo",
      cron: "0 18 * * 1-5",
      query: { message: "updated" },
    });
    await toggleAutomation({ id: "daily-demo", enabled: false });
    await triggerAutomation({ id: "daily-demo" });
    await getAutomationExecutions({ id: "daily-demo", limit: 20 });
    await getAutomationExecution({ executionId: "execution-1" });
    await deleteAutomation({ id: "daily-demo" });

    const calls = fetchMock.mock.calls.map(([url, options]) => ({
      url,
      body: JSON.parse(String((options as RequestInit).body || "{}")),
    }));
    expect(calls).toEqual([
      { url: "/api/automations", body: {} },
      { url: "/api/automation", body: { id: "daily-demo" } },
      {
        url: "/api/automation/create",
        body: {
          name: "Daily Demo",
          description: "Demo automation",
          cron: "0 9 * * *",
          agentKey: "demo-agent",
          enabled: true,
          query: { message: "hello", role: "user" },
        },
      },
      {
        url: "/api/automation/update",
        body: {
          id: "daily-demo",
          cron: "0 18 * * 1-5",
          query: { message: "updated" },
        },
      },
      {
        url: "/api/automation/toggle",
        body: { id: "daily-demo", enabled: false },
      },
      { url: "/api/automation/trigger", body: { id: "daily-demo" } },
      {
        url: "/api/automation/executions",
        body: { id: "daily-demo", limit: 20 },
      },
      {
        url: "/api/automation/execution",
        body: { executionId: "execution-1" },
      },
      { url: "/api/automation/delete", body: { id: "daily-demo" } },
    ]);
  });
});
