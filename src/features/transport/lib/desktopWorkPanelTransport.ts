import type {
  AgentWebclientWorkPanelBridge,
  WorkPanelBridgeResult,
  WorkPanelItemDescriptor,
  WorkPanelOpenDocumentInput,
  WorkPanelOpenDocumentResult,
  WorkPanelOpenResourceInput,
  WorkPanelOpenResourceResult,
} from "@/shared/contracts/generated/agentWebclientBridge";
import { AGENT_WEBCLIENT_BRIDGE_VERSION } from "@/shared/contracts/generated/agentWebclientBridge";
import { fromDesktopBridgeError } from "@/features/transport/contracts/realtimeTransportErrors";
import { supportsDesktopNativeDocument, supportsDesktopNativeResource } from "@/features/transport/lib/desktopBridge";
import { t } from "@/shared/i18n";

export interface WorkPanelTransport {
  openDescriptor(descriptor: WorkPanelItemDescriptor): Promise<WorkPanelBridgeResult>;
  supportsNativeDocument(): boolean;
  openNativeDocument(
    input: Omit<WorkPanelOpenDocumentInput, "version">,
  ): Promise<WorkPanelOpenDocumentResult | null>;
  supportsNativeResource(): boolean;
  openNativeResource(
    input: Omit<WorkPanelOpenResourceInput, "version">,
  ): Promise<WorkPanelOpenResourceResult | null>;
}

export class DesktopWorkPanelTransport implements WorkPanelTransport {
  constructor(
    private readonly bridge: AgentWebclientWorkPanelBridge,
  ) {}

  supportsNativeResource(): boolean {
    return supportsDesktopNativeResource(this.bridge);
  }

  supportsNativeDocument(): boolean {
    return supportsDesktopNativeDocument(this.bridge);
  }

  async openNativeDocument(
    input: Omit<WorkPanelOpenDocumentInput, "version">,
  ): Promise<WorkPanelOpenDocumentResult | null> {
    if (!this.supportsNativeDocument()) return null;
    const capabilityResult = await this.bridge.getCapabilities();
    if (!capabilityResult.ok) return capabilityResult;
    if (!capabilityResult.capabilities.includes("workpanel.open")) {
      return {
        ok: false,
        error: { code: "capability_denied", message: t("workPanel.error.openDenied") },
      };
    }
    return this.bridge.openDocument({ version: AGENT_WEBCLIENT_BRIDGE_VERSION, ...input });
  }

  async openNativeResource(
    input: Omit<WorkPanelOpenResourceInput, "version">,
  ): Promise<WorkPanelOpenResourceResult | null> {
    if (!this.supportsNativeResource()) return null;
    const capabilityResult = await this.bridge.getCapabilities();
    if (!capabilityResult.ok) return capabilityResult;
    if (!capabilityResult.capabilities.includes("workpanel.open")) {
      return {
        ok: false,
        error: {
          code: "capability_denied",
          message: t("workPanel.error.openDenied"),
        },
      };
    }
    return this.bridge.openResource({
      version: AGENT_WEBCLIENT_BRIDGE_VERSION,
      ...input,
    });
  }

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
