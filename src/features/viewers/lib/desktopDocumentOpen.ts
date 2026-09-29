import type {
  AgentWebclientWorkPanelBridge,
  WorkPanelDocumentSource,
  WorkPanelLocalApplication,
} from "@/shared/contracts/generated/agentWebclientBridge";
import { AGENT_WEBCLIENT_BRIDGE_VERSION } from "@/shared/contracts/generated/agentWebclientBridge";
import { readDesktopBridges } from "@/features/transport/lib/desktopBridge";
import { isDesktopAppMode } from "@/shared/utils/routing";
import { t } from "@/shared/i18n";
import type { ViewerTarget } from "./viewerTarget";

export function isDesktopLocalOpenDocument(name: string): boolean {
  return /\.(?:pptx?|docx?|xlsx?|pdf)$/iu.test(name);
}

export function resolveDesktopDocumentSource(target: ViewerTarget): WorkPanelDocumentSource | null {
  if (target.type === "file") {
    return target.agentKey && target.path
      ? { kind: "workspace-file", agentKey: target.agentKey, path: target.path }
      : null;
  }
  const source = target.source;
  return source?.agentKey && source.chatId && source.resourceId && source.relativePath
    ? { kind: source.kind, agentKey: source.agentKey, chatId: source.chatId,
        resourceId: source.resourceId, relativePath: source.relativePath }
    : null;
}

export function desktopDocumentSourceKey(source: WorkPanelDocumentSource): string {
  return source.kind === "workspace-file"
    ? JSON.stringify([source.kind, source.agentKey, source.path])
    : JSON.stringify([source.kind, source.agentKey, source.chatId, source.resourceId, source.relativePath]);
}

export function desktopDocumentOpenErrorKey(error: unknown, phase: "query" | "open") {
  const code = error && typeof error === "object" && "code" in error ? error.code : undefined;
  switch (code) {
    case "local_app_query_failed": return "contentViewer.localCopy.queryFailed";
    case "local_app_unavailable": return "contentViewer.localCopy.error.applicationUnavailable";
    case "capability_denied":
    case "surface_unavailable":
    case "target_unavailable":
    case "invalid_request": return "contentViewer.localCopy.error.sourceUnavailable";
    case "document_save_failed": return "contentViewer.localCopy.error.saveFailed";
    case "unsupported_document_type":
    case "unsupported_native_type": return "contentViewer.localCopy.error.typeMismatch";
    case "application_launch_failed": return "contentViewer.localCopy.error.launchFailed";
    case "duplicate_id": return "contentViewer.localCopy.error.alreadyPending";
    case "bridge_unavailable":
    case "version_mismatch":
    case "unsupported_in_current_view": return "contentViewer.localCopy.unavailable";
    default: return phase === "query" ? "contentViewer.localCopy.queryFailed" : "contentViewer.localCopy.openFailed";
  }
}

type DocumentOpenBridge = AgentWebclientWorkPanelBridge & {
  getDocumentOpenOptions: NonNullable<AgentWebclientWorkPanelBridge["getDocumentOpenOptions"]>;
  openDocumentCopy: NonNullable<AgentWebclientWorkPanelBridge["openDocumentCopy"]>;
};
export type DesktopDocumentOpenOptions =
  | { available: false }
  | { available: true; applications: WorkPanelLocalApplication[]; error?: string };
type OpenCopyResult = Awaited<ReturnType<DocumentOpenBridge["openDocumentCopy"]>>;

const optionRequests = new WeakMap<DocumentOpenBridge, Map<string, Promise<DesktopDocumentOpenOptions>>>();
const openRequests = new WeakMap<DocumentOpenBridge, Map<string, Promise<OpenCopyResult>>>();

function readBridge(): DocumentOpenBridge | null {
  if (!isDesktopAppMode()) return null;
  const bridge = readDesktopBridges().workPanel;
  return bridge && typeof bridge.getDocumentOpenOptions === "function" && typeof bridge.openDocumentCopy === "function"
    ? bridge as DocumentOpenBridge : null;
}

function shareRequest<T>(registry: WeakMap<DocumentOpenBridge, Map<string, Promise<T>>>,
  bridge: DocumentOpenBridge, key: string, request: () => Promise<T>): Promise<T> {
  let active = registry.get(bridge);
  if (!active) { active = new Map(); registry.set(bridge, active); }
  const current = active.get(key);
  if (current) return current;
  const pending = request().finally(() => {
    if (active.get(key) === pending) active.delete(key);
  });
  active.set(key, pending);
  return pending;
}

export function getDesktopDocumentOpenOptions(source: WorkPanelDocumentSource): Promise<DesktopDocumentOpenOptions> {
  const bridge = readBridge();
  if (!bridge) return Promise.resolve({ available: false });
  return shareRequest(optionRequests, bridge, desktopDocumentSourceKey(source), async () => {
    // The host grants this capability only to the registered current document Surface.
    try {
      let capability = await bridge.getCapabilities();
      // The preload can become visible just before its document Surface is registered.
      for (const delay of [150, 300]) {
        if (capability.ok || capability.error.code !== "surface_unavailable") break;
        await new Promise<void>((resolve) => globalThis.setTimeout(resolve, delay));
        capability = await bridge.getCapabilities();
      }
      if (!capability.ok) {
        return { available: true, applications: [], error: t(desktopDocumentOpenErrorKey(capability.error, "query")) };
      }
      if (!capability.capabilities.includes("workpanel.document.open-local")) return { available: false };
      const result = await bridge.getDocumentOpenOptions({ version: AGENT_WEBCLIENT_BRIDGE_VERSION, source });
      return result.ok
        ? { available: true, applications: result.applications }
        : { available: true, applications: [], error: t(desktopDocumentOpenErrorKey(result.error, "query")) };
    } catch (error) {
      return { available: true, applications: [], error: t(desktopDocumentOpenErrorKey(error, "query")) };
    }
  });
}

export function openDesktopDocumentCopy(source: WorkPanelDocumentSource, applicationId: string): Promise<OpenCopyResult> {
  const bridge = readBridge();
  if (!bridge) return Promise.reject(Object.assign(new Error(t("contentViewer.localCopy.unavailable")), { code: "bridge_unavailable" }));
  // Keep one native save dialog per source. Do not time out while the user is choosing a file.
  return shareRequest(openRequests, bridge, desktopDocumentSourceKey(source), async () => {
    const capability = await bridge.getCapabilities();
    if (!capability.ok) return capability;
    if (!capability.capabilities.includes("workpanel.document.open-local")) {
      throw Object.assign(new Error(t("contentViewer.localCopy.unavailable")), { code: "capability_denied" });
    }
    return bridge.openDocumentCopy({ version: AGENT_WEBCLIENT_BRIDGE_VERSION, source, applicationId });
  });
}
