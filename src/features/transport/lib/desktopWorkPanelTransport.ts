import type {
  AgentWebclientWorkPanelBridge,
  WorkPanelBridgeResult,
  WorkPanelItemDescriptor,
} from "@/features/transport/contracts/generated/agentWebclientBridge";
import { AGENT_WEBCLIENT_BRIDGE_VERSION } from "@/features/transport/contracts/generated/agentWebclientBridge";
import { fromDesktopBridgeError } from "@/features/transport/contracts/realtimeTransportErrors";
import { DesktopBridgeSession } from "@/features/transport/lib/desktopBridge";

export interface WorkPanelTransport {
  openDescriptor(descriptor: WorkPanelItemDescriptor): Promise<WorkPanelBridgeResult>;
}

export class DesktopWorkPanelTransport implements WorkPanelTransport {
  constructor(
    private readonly session: DesktopBridgeSession,
    private readonly bridge: AgentWebclientWorkPanelBridge,
  ) {}

  async openDescriptor(
    descriptor: WorkPanelItemDescriptor,
  ): Promise<WorkPanelBridgeResult> {
    await this.session.requireCapability("workpanel.open");
    const result = await this.bridge.openItem({
      version: AGENT_WEBCLIENT_BRIDGE_VERSION,
      descriptor,
    });
    if (!result.ok) throw fromDesktopBridgeError(result.error);
    return result;
  }
}
