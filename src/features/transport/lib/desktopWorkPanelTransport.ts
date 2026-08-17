import type {
  AgentWebclientWorkPanelBridge,
  WorkPanelBridgeResult,
  WorkPanelItemDescriptor,
} from "@/features/transport/contracts/generated/agentWebclientBridge";
import { AGENT_WEBCLIENT_BRIDGE_VERSION } from "@/features/transport/contracts/generated/agentWebclientBridge";
import { fromDesktopBridgeError } from "@/features/transport/contracts/realtimeTransportErrors";

export interface WorkPanelTransport {
  openDescriptor(descriptor: WorkPanelItemDescriptor): Promise<WorkPanelBridgeResult>;
}

export class DesktopWorkPanelTransport implements WorkPanelTransport {
  constructor(
    private readonly bridge: AgentWebclientWorkPanelBridge,
  ) {}

  async openDescriptor(
    descriptor: WorkPanelItemDescriptor,
  ): Promise<WorkPanelBridgeResult> {
    const capabilityResult = await this.bridge.getCapabilities();
    if (!capabilityResult.ok) throw fromDesktopBridgeError(capabilityResult.error);
    if (!capabilityResult.capabilities.includes("workpanel.open")) {
      throw new Error("Current Desktop surface cannot open WorkPanel items");
    }
    const result = await this.bridge.openItem({
      version: AGENT_WEBCLIENT_BRIDGE_VERSION,
      descriptor,
    });
    if (!result.ok) throw fromDesktopBridgeError(result.error);
    return result;
  }
}
