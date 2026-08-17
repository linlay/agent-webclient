import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  AGENT_WEBCLIENT_BRIDGE_VERSION,
  AGENT_WEBCLIENT_PLATFORM_WS_GLOBAL,
  AGENT_WEBCLIENT_PLATFORM_WS_TRANSPORT_VERSION,
  AGENT_WEBCLIENT_WORKPANEL_BRIDGE_GLOBAL,
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
    expect(source).toContain(
      "sha256:3d1a8f85397bacf803ddce187f6ee67590ab4ebb682bb1dfba4220a3921506d3",
    );
    expect(createHash("sha256").update(source).digest("hex")).toBe(
      "930950ad4698a2b007ebe1438f593399912f5886137cd89ff86143ba78e39d22",
    );
  });
});
