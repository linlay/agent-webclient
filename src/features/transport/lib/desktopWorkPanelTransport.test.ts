import type {
  AgentWebclientWorkPanelBridge,
} from "@/shared/contracts/generated/agentWebclientBridge";
import { AGENT_WEBCLIENT_BRIDGE_VERSION } from "@/shared/contracts/generated/agentWebclientBridge";
import { DesktopWorkPanelTransport } from "@/features/transport/lib/desktopWorkPanelTransport";

describe("DesktopWorkPanelTransport", () => {
  it("opens canonical descriptors and preserves bridge failures", async () => {
    const workPanel: AgentWebclientWorkPanelBridge = {
      getCapabilities: jest.fn(async () => ({ ok: true, capabilities: ["workpanel.open"] })),
      openResource: jest.fn(async () => ({
        ok: true,
        workspaceId: "workpanel:chat-1",
        itemId: "resource-image-1",
        renderer: "native-image",
      })),
      openItem: jest.fn(async () => ({ ok: true, workspaceId: "workpanel:chat-1" })),
      activateItem: jest.fn(),
      closeItem: jest.fn(),
    };
    const transport = new DesktopWorkPanelTransport(workPanel);
    await expect(transport.openDescriptor({
      kind: "webclient",
      module: "overview",
      route: "/overview/agent-1?chatId=chat-1",
      context: { agentKey: "agent-1", chatId: "chat-1" },
    })).resolves.toMatchObject({ ok: true });
    expect(workPanel.openItem).toHaveBeenCalledWith({
      version: AGENT_WEBCLIENT_BRIDGE_VERSION,
      descriptor: expect.objectContaining({ module: "overview" }),
    });

    await expect(transport.openNativeResource({
      profile: "artifact",
      agentKey: "agent-1",
      chatId: "chat-1",
      resourceId: "artifact-1",
      relativePath: "artifacts/run-1/image.png",
    })).resolves.toMatchObject({ ok: true, renderer: "native-image" });
    expect(workPanel.openResource).toHaveBeenCalledWith(expect.objectContaining({
      version: AGENT_WEBCLIENT_BRIDGE_VERSION,
      resourceId: "artifact-1",
    }));

    (workPanel.openItem as jest.Mock).mockResolvedValueOnce({
      ok: false,
      error: { code: "capability_denied", message: "summary cannot open items" },
    });
    await expect(transport.openDescriptor({
      kind: "webclient",
      module: "planning",
      route: "/planning-viewer/agent-1?chatId=chat-1&planningId=planning-1",
      context: { agentKey: "agent-1", chatId: "chat-1", planningId: "planning-1" },
    })).rejects.toMatchObject({ code: "capability_denied" });
  });

  it("keeps the legacy v4 bridge on the Resource Viewer path", async () => {
    const legacyBridge = {
      getCapabilities: jest.fn(async () => ({ ok: true, capabilities: ["workpanel.open"] })),
      openItem: jest.fn(),
      activateItem: jest.fn(),
      closeItem: jest.fn(),
    } as unknown as AgentWebclientWorkPanelBridge;
    const transport = new DesktopWorkPanelTransport(legacyBridge);
    expect(transport.supportsNativeResource()).toBe(false);
    await expect(transport.openNativeResource({
      profile: "artifact",
      agentKey: "agent-1",
      chatId: "chat-1",
      resourceId: "artifact-1",
      relativePath: "artifacts/run-1/image.png",
    })).resolves.toBeNull();
  });
});
