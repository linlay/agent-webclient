import * as client from "@/shared/data/api/client";
import * as routedClient from "@/shared/data/api/routedClient";
import * as publicData from "@/shared/data";
import * as automationRequests from "@/shared/data/api/requests/automations";
import { ApiError, setAccessToken } from "@/shared/data/api/http";

const automationMethods = [
  "getAutomations",
  "getAutomation",
  "createAutomation",
  "updateAutomation",
  "deleteAutomation",
  "toggleAutomation",
  "triggerAutomation",
  "getAutomationExecutions",
  "getAutomationExecution",
] as const;

describe("data API compatibility entry points", () => {
  it.each(automationMethods)("shares the %s implementation across all entry points", (name) => {
    expect(client[name]).toBe(automationRequests[name]);
    expect(routedClient[name]).toBe(automationRequests[name]);
    expect(publicData[name]).toBe(automationRequests[name]);
  });

  it("selects the routed implementation for every routed public method", () => {
    for (const [name, implementation] of Object.entries(routedClient)) {
      expect(publicData[name as keyof typeof publicData]).toBe(implementation);
    }
    expect(publicData.getAgents).not.toBe(client.getAgents);
    expect(publicData.getChats).not.toBe(client.getChats);
    expect(publicData.saveMemoryScope).not.toBe(client.saveMemoryScope);
  });

  it("preserves every remaining raw export in the public entry point", () => {
    for (const [name, implementation] of Object.entries(client)) {
      if (Object.prototype.hasOwnProperty.call(routedClient, name)) continue;
      expect(publicData[name as keyof typeof publicData]).toBe(implementation);
    }
  });

  it("shares the auth state and error constructor across legacy and public paths", () => {
    try {
      client.setAccessToken("legacy-token");
      expect(publicData.getCurrentAccessToken()).toBe("legacy-token");
      publicData.setAccessToken("public-token");
      expect(client.getCurrentAccessToken()).toBe("public-token");
      expect(routedClient.getCurrentAccessToken()).toBe("public-token");
      expect(client.setAccessToken).toBe(setAccessToken);
      const error = new ApiError("failed", { status: 403, code: "denied", data: { id: 1 } });
      expect(error).toBeInstanceOf(client.ApiError);
      expect(error).toBeInstanceOf(publicData.ApiError);
      expect(error).toMatchObject({ status: 403, code: "denied", data: { id: 1 } });
    } finally {
      setAccessToken("");
    }
  });
});
