import { defineEndpoint } from "@/shared/data/api/endpointRegistry";
import { dataEndpoints } from "@/shared/data/api/endpoints";

describe("endpoint WebSocket capabilities", () => {
  it("requires every auto endpoint to declare supported backends", () => {
    expect(() => defineEndpoint({
      key: "missing.capability",
      path: "/api/missing",
      method: "GET",
      transport: "auto",
    })).toThrow("Auto endpoint missing.capability must declare wsBackends");
  });

  it("declares Platform and Gateway support for primary navigation data", () => {
    expect(dataEndpoints.agents.wsBackends).toEqual(["platform", "gateway"]);
    expect(dataEndpoints.agent.wsBackends).toEqual(["platform", "gateway"]);
    expect(dataEndpoints.chats.wsBackends).toEqual(["platform", "gateway"]);
    expect(dataEndpoints.chat.wsBackends).toEqual(["platform", "gateway"]);
  });

  it("keeps backend-specific and management routes explicit", () => {
    expect(dataEndpoints.agentSkills.wsBackends).toEqual(["platform"]);
    expect(dataEndpoints.memoryFile.transport).toBe("http");
    expect(dataEndpoints.memoryFileSave.method).toBe("PUT");
    expect(dataEndpoints.agentOrder.transport).toBe("http");
    expect(dataEndpoints.adminRegistries.transport).toBe("http");
    expect(dataEndpoints.automations.transport).toBe("http");
    expect(dataEndpoints.automations.method).toBe("POST");
    expect(dataEndpoints.automation.method).toBe("POST");
    expect(dataEndpoints.automationExecutions.method).toBe("POST");
    expect(dataEndpoints.automationExecution.method).toBe("POST");
    expect(dataEndpoints.automationTrigger.method).toBe("POST");
    expect(dataEndpoints.automationTrigger.transport).toBe("http");
    expect(dataEndpoints.upload.transport).toBe("http");
    expect(dataEndpoints.resource.transport).toBe("resource");
  });
});
