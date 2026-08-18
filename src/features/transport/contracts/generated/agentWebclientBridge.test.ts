import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  AGENT_WEBCLIENT_BRIDGE_VERSION,
  AGENT_WEBCLIENT_PLATFORM_WS_GLOBAL,
  AGENT_WEBCLIENT_PLATFORM_WS_TRANSPORT_VERSION,
  AGENT_WEBCLIENT_WORKPANEL_BRIDGE_GLOBAL,
  AGENT_WEBCLIENT_WORKPANEL_RESOURCE_DOWNLOAD_ACTION,
  AGENT_WEBCLIENT_WORKPANEL_RESOURCE_DOWNLOAD_VERSION,
  isAgentWebclientSurfaceKind,
} from "./agentWebclientBridge";

describe("generated Agent WebClient bridge contract", () => {
  it("keeps the canonical version, globals, source header and mirror hash", () => {
    const source = readFileSync(join(__dirname, "agentWebclientBridge.ts"), "utf8");
    expect(AGENT_WEBCLIENT_BRIDGE_VERSION).toBe(3);
    expect(AGENT_WEBCLIENT_PLATFORM_WS_TRANSPORT_VERSION).toBe(1);
    expect(AGENT_WEBCLIENT_PLATFORM_WS_GLOBAL).toBe(
      "__AGENT_WEBCLIENT_PLATFORM_WS__",
    );
    expect(AGENT_WEBCLIENT_WORKPANEL_BRIDGE_GLOBAL).toBe(
      "__AGENT_WEBCLIENT_WORKPANEL_BRIDGE__",
    );
    expect(AGENT_WEBCLIENT_WORKPANEL_RESOURCE_DOWNLOAD_ACTION).toBe(
      "workPanel.resource.downloadCurrent",
    );
    expect(AGENT_WEBCLIENT_WORKPANEL_RESOURCE_DOWNLOAD_VERSION).toBe(1);
    expect(isAgentWebclientSurfaceKind("agent-management")).toBe(true);
    expect(source).toContain(
      "sha256:dc43c1f46783295d3ee3d05513748d7b5290d3ea55a2c1f796f474cc27e23856",
    );
    expect(createHash("sha256").update(source).digest("hex")).toBe(
      "2246bcf78ab03391f7233bd2571901313ca82e5b4ec3a9ac90ef86588edf2076",
    );
  });
});
