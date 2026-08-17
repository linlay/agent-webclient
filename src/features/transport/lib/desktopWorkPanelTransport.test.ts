import type {
  AgentWebclientWorkPanelBridge,
} from "@/features/transport/contracts/generated/agentWebclientBridge";
import { AGENT_WEBCLIENT_BRIDGE_VERSION } from "@/features/transport/contracts/generated/agentWebclientBridge";
import { DesktopWorkPanelTransport } from "@/features/transport/lib/desktopWorkPanelTransport";

describe("DesktopWorkPanelTransport", () => {
  it("opens canonical descriptors and preserves bridge failures", async () => {
    const workPanel: AgentWebclientWorkPanelBridge = {
      getCapabilities: jest.fn(async () => ({ ok: true, capabilities: ["workpanel.open"] })),
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

    (workPanel.openItem as jest.Mock).mockResolvedValueOnce({
      ok: false,
      error: { code: "capability_denied", message: "summary cannot open items" },
    });
    await expect(transport.openDescriptor({
      kind: "webclient",
      module: "planning",
      route: "/planning-view/agent-1?chatId=chat-1&planningId=planning-1",
      context: { agentKey: "agent-1", chatId: "chat-1", planningId: "planning-1" },
    })).rejects.toMatchObject({ code: "capability_denied" });
  });
});
