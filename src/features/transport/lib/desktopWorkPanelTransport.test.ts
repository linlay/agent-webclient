import type {
  AgentWebclientRealtimeBridge,
  AgentWebclientWorkPanelBridge,
} from "@/features/transport/contracts/generated/agentWebclientBridge";
import { AGENT_WEBCLIENT_BRIDGE_VERSION } from "@/features/transport/contracts/generated/agentWebclientBridge";
import { DesktopBridgeSession } from "@/features/transport/lib/desktopBridge";
import { DesktopWorkPanelTransport } from "@/features/transport/lib/desktopWorkPanelTransport";

describe("DesktopWorkPanelTransport", () => {
  it("opens canonical descriptors and preserves bridge failures", async () => {
    const realtime: AgentWebclientRealtimeBridge = {
      hello: jest.fn(async () => ({
        version: AGENT_WEBCLIENT_BRIDGE_VERSION,
        surface: {
          kind: "agent-chat",
          capabilities: ["workpanel.open"],
          ownerChatId: "chat-1",
          route: "/agent/agent-1?chatId=chat-1",
        },
        connection: { phase: "connected", generation: 1 },
      })),
      request: jest.fn(),
      subscribe: jest.fn(),
      detach: jest.fn(),
      onMessage: jest.fn(() => () => undefined),
    };
    const workPanel: AgentWebclientWorkPanelBridge = {
      openItem: jest.fn(async () => ({ ok: true, workspaceId: "workpanel:chat-1" })),
      activateItem: jest.fn(),
      closeItem: jest.fn(),
    };
    const transport = new DesktopWorkPanelTransport(
      new DesktopBridgeSession(realtime),
      workPanel,
    );
    await expect(transport.openDescriptor({
      kind: "webclient",
      module: "summary",
      route: "/overview?chatId=chat-1",
      context: { chatId: "chat-1" },
    })).resolves.toMatchObject({ ok: true });
    expect(workPanel.openItem).toHaveBeenCalledWith({
      version: AGENT_WEBCLIENT_BRIDGE_VERSION,
      descriptor: expect.objectContaining({ module: "summary" }),
    });

    (workPanel.openItem as jest.Mock).mockResolvedValueOnce({
      ok: false,
      error: { code: "capability_denied", message: "summary cannot open items" },
    });
    await expect(transport.openDescriptor({
      kind: "webclient",
      module: "planning",
      route: "/overview?chatId=chat-1&view=planning&nodeId=node-1",
      context: { chatId: "chat-1", nodeId: "node-1" },
    })).rejects.toMatchObject({ code: "capability_denied" });
  });
});
