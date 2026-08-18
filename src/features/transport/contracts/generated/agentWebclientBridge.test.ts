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
    expect(source).toContain(
      "sha256:52f2b663f89e5f18ae762d90b66bc03c3afe9fe8ea6613c1fc7749d23f0ca6ea",
    );
    expect(createHash("sha256").update(source).digest("hex")).toBe(
      "70e12abeeef85a739ce0a95e17b1c5547da97b9c8df2bce3863ed082e96d8282",
    );
  });
});
