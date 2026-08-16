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
      "sha256:c4a4d8f0fae1cd0db31f5add491fbafda5ffac17e2527362fafb09559e9826c7",
    );
    expect(createHash("sha256").update(source).digest("hex")).toBe(
      "d69d9a360087fb711d0c753c9056a7b687abb91e78f588e5121485fde4f4e924",
    );
  });
});
