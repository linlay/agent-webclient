import { createHash } from "node:crypto";
import { cpSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import {
  AGENT_WEBCLIENT_BRIDGE_VERSION,
  AGENT_WEBCLIENT_PLATFORM_FRAME_PORT_GLOBAL,
  AGENT_WEBCLIENT_PLATFORM_FRAME_PORT_TRANSPORT_VERSION,
  AGENT_WEBCLIENT_WORKPANEL_BRIDGE_GLOBAL,
  AGENT_WEBCLIENT_COMPOSER_DRAFT_ACTION,
  AGENT_WEBCLIENT_WORKPANEL_PREVIEW_REVIEW_ACTION,
  AGENT_WEBCLIENT_WORKPANEL_RESOURCE_DOWNLOAD_ACTION,
  AGENT_WEBCLIENT_WORKPANEL_RESOURCE_DOWNLOAD_VERSION,
  isAgentWebclientSurfaceKind,
  parseAgentWebclientVisualSnapshot,
} from "./agentWebclientBridge";

describe("generated Agent WebClient bridge contract", () => {
  it("keeps the canonical version, globals, source header and mirror hash", () => {
    const source = readFileSync(join(__dirname, "agentWebclientBridge.ts"), "utf8");
    const canonicalSource = source.replace(/\r\n/gu, "\n");
    expect(AGENT_WEBCLIENT_BRIDGE_VERSION).toBe(6);
    expect(AGENT_WEBCLIENT_PLATFORM_FRAME_PORT_TRANSPORT_VERSION).toBe(2);
    expect(AGENT_WEBCLIENT_PLATFORM_FRAME_PORT_GLOBAL).toBe(
      "__AGENT_WEBCLIENT_PLATFORM_FRAME_PORT__",
    );
    expect(AGENT_WEBCLIENT_WORKPANEL_BRIDGE_GLOBAL).toBe(
      "__AGENT_WEBCLIENT_WORKPANEL_BRIDGE__",
    );
    expect(AGENT_WEBCLIENT_WORKPANEL_RESOURCE_DOWNLOAD_ACTION).toBe(
      "workPanel.resource.downloadCurrent",
    );
    expect(AGENT_WEBCLIENT_WORKPANEL_RESOURCE_DOWNLOAD_VERSION).toBe(1);
    expect(AGENT_WEBCLIENT_WORKPANEL_PREVIEW_REVIEW_ACTION).toBe(
      "workPanel.previewReview.dispatch",
    );
    expect(AGENT_WEBCLIENT_COMPOSER_DRAFT_ACTION).toBe(
      "workPanel.composer.insertDraft",
    );
    expect(isAgentWebclientSurfaceKind("agent-management")).toBe(true);
    expect(source).toContain(
      "sha256:c502de2716a0192554bd44750657a5e00cbe8a265132c9e20888a618f96c51e7",
    );
    expect(createHash("sha256").update(canonicalSource).digest("hex")).toBe(
      "d288a45a2c6bcff58e7b8e7f15a721f4ed72b02d98d443bdde83915e435318c2",
    );
  });

  it("retains pinned skin visuals alongside the selection explanation role", () => {
    const snapshot = {
      schemaVersion: "1.1", revision: 1,
      resourceSet: "12345678-1234-1234-1234-123456789012",
      visuals: { images: { "heading.pinned.zh-CN": "heading.pinned.zh-CN", "heading.pinned.en-US": "heading.pinned.en-US" }, styles: {} },
    };
    expect(parseAgentWebclientVisualSnapshot(snapshot)).toEqual(snapshot);
    expect(isAgentWebclientSurfaceKind("agent-selection-explain")).toBe(true);
  });

  it("accepts CRLF vendored and Desktop mirror copies", () => {
    const fixtureRoot = mkdtempSync(join(tmpdir(), "agent-webclient-contract-"));
    try {
      const fixtureScript = join(fixtureRoot, "scripts", "check-agent-webclient-contract.js");
      const fixtureVendored = join(
        fixtureRoot,
        "src",
        "shared",
        "contracts",
        "generated",
        "agentWebclientBridge.ts",
      );
      const fixtureMirror = join(fixtureRoot, "desktop-mirror.ts");
      const source = readFileSync(join(__dirname, "agentWebclientBridge.ts"), "utf8");
      const normalized = source.replace(/\r\n/gu, "\n");
      const crlf = normalized.replace(/\n/gu, "\r\n");

      mkdirSync(join(fixtureRoot, "scripts"), { recursive: true });
      mkdirSync(join(fixtureRoot, "src", "shared", "contracts", "generated"), { recursive: true });
      cpSync(join(__dirname, "..", "..", "..", "..", "scripts", "check-agent-webclient-contract.js"), fixtureScript);
      writeFileSync(fixtureVendored, crlf, "utf8");
      writeFileSync(fixtureMirror, crlf, "utf8");

      const result = spawnSync(process.execPath, [fixtureScript], {
        cwd: fixtureRoot,
        env: { ...process.env, AGENT_WEBCLIENT_CONTRACT_PATH: fixtureMirror },
        encoding: "utf8",
      });

      expect(result.status).toBe(0);
    } finally {
      rmSync(fixtureRoot, { recursive: true, force: true });
    }
  });
});
