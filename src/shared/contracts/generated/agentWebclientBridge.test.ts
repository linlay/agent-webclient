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
  AGENT_WEBCLIENT_WORKPANEL_DOCUMENT_EDIT_MODE_ACTION,
  AGENT_WEBCLIENT_WORKPANEL_DOCUMENT_EDIT_MODE_VERSION,
  AGENT_WEBCLIENT_WORKPANEL_PREVIEW_REVIEW_ACTION,
  AGENT_WEBCLIENT_WORKPANEL_RESOURCE_DOWNLOAD_ACTION,
  AGENT_WEBCLIENT_WORKPANEL_RESOURCE_DOWNLOAD_VERSION,
  isAgentWebclientSurfaceKind,
  parseAgentWebclientWorkPanelFileLocationAction,
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
    expect(AGENT_WEBCLIENT_WORKPANEL_DOCUMENT_EDIT_MODE_ACTION).toBe(
      "workPanel.document.editMode",
    );
    expect(AGENT_WEBCLIENT_WORKPANEL_DOCUMENT_EDIT_MODE_VERSION).toBe(1);
    expect(AGENT_WEBCLIENT_COMPOSER_DRAFT_ACTION).toBe(
      "workPanel.composer.insertDraft",
    );
    expect(isAgentWebclientSurfaceKind("agent-management")).toBe(true);
    expect(source).toContain(
      "sha256:4702910863c6c629aebd6c1efbf5f641858067fa80697a4c72c9897b2c31629c",
    );
    expect(createHash("sha256").update(canonicalSource).digest("hex")).toBe(
      "c6671110b394bd852b73ebba250ef974b76df56d87c7b9b33ddcd67942cfec23",
    );
  });

  it("accepts only versioned file locations with positive integer lines and revisions", () => {
    const action = {
      action: "workPanel.file.revealLine",
      version: 1,
      targetKey: "file:agent:src/shell_bash.yml",
      line: 13,
      revision: 2,
    };
    expect(parseAgentWebclientWorkPanelFileLocationAction(action)).toEqual(action);
    for (const invalid of [
      { ...action, line: 0 },
      { ...action, line: 13.5 },
      { ...action, revision: 0 },
      { ...action, version: 2 },
      { ...action, targetKey: "resource:other" },
      { ...action, extra: true },
    ]) {
      expect(parseAgentWebclientWorkPanelFileLocationAction(invalid)).toBeNull();
    }
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
