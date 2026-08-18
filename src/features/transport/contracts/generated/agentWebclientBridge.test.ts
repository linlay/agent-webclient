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
      "sha256:c479d674e7b697cdabf3b5e44ad0e0230795afda7e7b97b75f0e538ef9101c84",
    );
    expect(createHash("sha256").update(source).digest("hex")).toBe(
      "c29ab168cdcf9f91a5cf3d98492ae1c9bf1359549975ce60f52892f61076a396",
    );
  });
});
