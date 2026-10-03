import * as routedClient from "@/shared/data/api/routedClient";
import * as publicData from "@/shared/data";
import * as automationRequests from "@/shared/data/api/requests/automations";
import * as agentRequests from "@/shared/data/api/requests/agents";
import * as chatRequests from "@/shared/data/api/requests/chats";
import * as memoryRequests from "@/shared/data/api/requests/memory";
import * as voiceRequests from "@/shared/data/api/requests/voice";
import { ApiError, setAccessToken, getCurrentAccessToken } from "@/shared/data/api/http";

const automationMethods = [
  "getAutomations", "getAutomation", "createAutomation", "updateAutomation",
  "deleteAutomation", "toggleAutomation", "triggerAutomation",
  "getAutomationExecutions", "getAutomationExecution",
] as const;

describe("data API public and routed entry points", () => {
  it.each(automationMethods)("shares the HTTP-only %s implementation", (name) => {
    expect(routedClient[name]).toBe(automationRequests[name]);
    expect(publicData[name]).toBe(automationRequests[name]);
  });

  it("selects the routed implementation for every routed public method", () => {
    for (const [name, implementation] of Object.entries(routedClient)) {
      expect(publicData[name as keyof typeof publicData]).toBe(implementation);
    }
    expect(publicData.getAgents).not.toBe(agentRequests.getAgents);
    expect(publicData.getChats).not.toBe(chatRequests.getChats);
    expect(publicData.saveMemoryFile).toBe(memoryRequests.saveMemoryFile);
  });

  it("exposes the flexible voice requests without changing their implementation", () => {
    expect(publicData.getVoiceCapabilitiesFlexible).toBe(voiceRequests.getVoiceCapabilitiesFlexible);
    expect(publicData.getVoiceVoicesFlexible).toBe(voiceRequests.getVoiceVoicesFlexible);
  });

  it("shares auth state and the error constructor across raw and public paths", () => {
    try {
      setAccessToken("raw-token");
      expect(publicData.getCurrentAccessToken()).toBe("raw-token");
      publicData.setAccessToken("public-token");
      expect(getCurrentAccessToken()).toBe("public-token");
      expect(routedClient.getCurrentAccessToken()).toBe("public-token");
      expect(publicData.setAccessToken).toBe(setAccessToken);
      const error = new ApiError("failed", { status: 403, code: "denied", data: { id: 1 } });
      expect(error).toBeInstanceOf(publicData.ApiError);
      expect(error).toMatchObject({ status: 403, code: "denied", data: { id: 1 } });
    } finally {
      setAccessToken("");
    }
  });
});
