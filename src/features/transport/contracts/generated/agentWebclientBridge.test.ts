import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  AGENT_WEBCLIENT_BRIDGE_VERSION,
  AGENT_WEBCLIENT_REALTIME_BRIDGE_GLOBAL,
  AGENT_WEBCLIENT_WORKPANEL_BRIDGE_GLOBAL,
} from "./agentWebclientBridge";

describe("generated Agent WebClient bridge contract", () => {
  it("keeps the canonical version, globals, source header and mirror hash", () => {
    const source = readFileSync(join(__dirname, "agentWebclientBridge.ts"), "utf8");
    expect(AGENT_WEBCLIENT_BRIDGE_VERSION).toBe(2);
    expect(AGENT_WEBCLIENT_REALTIME_BRIDGE_GLOBAL).toBe(
      "__AGENT_WEBCLIENT_REALTIME_BRIDGE__",
    );
    expect(AGENT_WEBCLIENT_WORKPANEL_BRIDGE_GLOBAL).toBe(
      "__AGENT_WEBCLIENT_WORKPANEL_BRIDGE__",
    );
    expect(source).toContain(
      "sha256:0fe618fdd080ae5f1b88778c5378713af867dbb8809d9d18f655f99f56f4cd58",
    );
    expect(createHash("sha256").update(source).digest("hex")).toBe(
      "b77e5d5a5d32095a0774926c34972b9d62e2fc8373efe529d61fb9acd281142e",
    );
  });
});
