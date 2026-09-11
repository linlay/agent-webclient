// Standalone appearance remains independent of the business bridge versions.
// The wire parser is generated from Desktop's canonical, versioned contract.
export {
  AGENT_WEBCLIENT_APPEARANCE_GLOBAL as DESKTOP_APPEARANCE_GLOBAL,
  parseAgentWebclientAppearanceSnapshot as parseDesktopAppearance,
} from "./generated/agentWebclientBridge";
export type {
  AgentWebclientAppearanceBridge as DesktopAppearanceBridge,
  AgentWebclientAppearanceSnapshot as DesktopAppearanceSnapshot,
} from "./generated/agentWebclientBridge";
