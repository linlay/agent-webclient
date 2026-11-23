import {
  AGENT_WEBCLIENT_BRIDGE_VERSION,
  type AgentWebclientTerminalContextMenuAction,
  type AgentWebclientTerminalContextMenuRequest,
  type AgentWebclientTerminalHostBridge,
  type AgentWebclientTerminalShortcutEvent,
  type AgentWebclientWorkPanelBridge,
} from "@/shared/contracts/generated/agentWebclientBridge";
import { buildFileViewerRoute } from "@/shared/utils/fileViewerRoute";
import {
  isDesktopWorkPanelBridge,
  readDesktopTerminalHostBridge,
} from "@/features/transport/lib/desktopBridge";

export type TerminalContextMenuAction = AgentWebclientTerminalContextMenuAction;
export type TerminalContextMenuRequest = AgentWebclientTerminalContextMenuRequest;
export type TerminalShortcutEvent = AgentWebclientTerminalShortcutEvent;

export interface TerminalFileLinkTarget {
  readonly agentKey: string;
  readonly path: string;
  readonly line?: number;
  readonly col?: number;
}

export interface TerminalDroppedFilesInput {
  readonly files: Iterable<File>;
  readonly uriList?: string;
}

export interface TerminalHostAdapter {
  readonly kind: "web" | "desktop";
  showContextMenu(
    request: TerminalContextMenuRequest,
  ): Promise<TerminalContextMenuAction | null>;
  revealCwd(cwd: string): Promise<{ ok: boolean; message?: string }>;
  readClipboardText(): Promise<string>;
  writeClipboardText(text: string): Promise<void>;
  resolveDroppedFilePaths(input: TerminalDroppedFilesInput): string[];
  subscribeShortcut(listener: (event: TerminalShortcutEvent) => void): () => void;
  openFileLink(target: TerminalFileLinkTarget): Promise<boolean> | boolean;
}

function fileTitleFromPath(targetPath: string): string {
  const parts = targetPath.replace(/\\/g, "/").split("/").filter(Boolean);
  return parts[parts.length - 1] || targetPath;
}

function decodeFileUri(uri: string): string {
  const trimmed = uri.trim();
  if (!trimmed || trimmed.startsWith("#") || !/^file:\/\//i.test(trimmed)) {
    return "";
  }
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== "file:") return "";
    if (parsed.hostname && parsed.hostname.toLowerCase() !== "localhost") {
      // Windows UNC file://server/share/path -> \\server\share\path
      const uncPath = decodeURIComponent(parsed.pathname).replace(/\//g, "\\");
      return `\\\\${parsed.hostname}${uncPath}`;
    }
    let decoded = decodeURIComponent(parsed.pathname);
    // Windows drive URI file:///C:/dir -> C:/dir
    if (/^\/[a-zA-Z]:\//.test(decoded)) {
      decoded = decoded.slice(1);
    }
    return decoded;
  } catch {
    return "";
  }
}

function extractDroppedPaths(
  input: TerminalDroppedFilesInput,
  getFilePath?: (file: File) => string,
): string[] {
  const paths: string[] = [];
  const fileList = Array.from(input.files);
  for (const file of fileList) {
    let resolved = "";
    if (typeof getFilePath === "function") {
      try {
        resolved = String(getFilePath(file) || "").trim();
      } catch {
        resolved = "";
      }
    }
    if (!resolved) {
      const fileWithPath = file as File & { path?: unknown };
      if (typeof fileWithPath.path === "string" && fileWithPath.path.trim()) {
        resolved = fileWithPath.path.trim();
      }
    }
    if (!resolved && file.name) {
      resolved = file.name.trim();
    }
    if (resolved) {
      paths.push(resolved);
    }
  }
  if (paths.length > 0) {
    return paths;
  }
  const rawUriList = String(input.uriList || "");
  if (!rawUriList) return [];
  for (const line of rawUriList.split(/\r?\n/u)) {
    const decoded = decodeFileUri(line);
    if (decoded) {
      paths.push(decoded);
    }
  }
  return paths;
}

async function readBrowserClipboard(): Promise<string> {
  try {
    if (typeof navigator !== "undefined" && navigator.clipboard?.readText) {
      return await navigator.clipboard.readText();
    }
  } catch {
    // Clipboard access can be denied outside user gestures.
  }
  return "";
}

async function writeBrowserClipboard(text: string): Promise<void> {
  if (!text) return;
  try {
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
    }
  } catch {
    // Ignore clipboard write rejection in restricted browser contexts.
  }
}

function defaultOpenWebUrl(url: string): void {
  if (typeof window === "undefined") return;
  window.open(url, "_blank", "noopener,noreferrer");
}

export function createWebTerminalHostAdapter(options: {
  openUrl?: (url: string) => void;
} = {}): TerminalHostAdapter {
  const openUrl = options.openUrl ?? defaultOpenWebUrl;
  return {
    kind: "web",
    async showContextMenu() {
      return null;
    },
    async revealCwd() {
      return { ok: false };
    },
    readClipboardText: readBrowserClipboard,
    writeClipboardText: writeBrowserClipboard,
    resolveDroppedFilePaths(input) {
      return extractDroppedPaths(input);
    },
    subscribeShortcut() {
      return () => undefined;
    },
    openFileLink(target) {
      const route = buildFileViewerRoute({
        agentKey: target.agentKey,
        path: target.path,
        ...(target.line ? { line: target.line } : {}),
        ...(target.col ? { col: target.col } : {}),
      });
      if (!route) return false;
      openUrl(route);
      return true;
    },
  };
}

export function createDesktopTerminalHostAdapter(options: {
  hostBridge: AgentWebclientTerminalHostBridge;
  workPanelBridge?: AgentWebclientWorkPanelBridge | null;
  openFallbackUrl?: (url: string) => void;
}): TerminalHostAdapter {
  const { hostBridge, workPanelBridge, openFallbackUrl = defaultOpenWebUrl } = options;
  return {
    kind: "desktop",
    async showContextMenu(request) {
      try {
        const result = await hostBridge.showContextMenu(request);
        return result?.action ?? null;
      } catch {
        return null;
      }
    },
    async revealCwd(cwd) {
      try {
        return await hostBridge.revealCwd(cwd);
      } catch {
        return { ok: false };
      }
    },
    async readClipboardText() {
      if (typeof hostBridge.readClipboardText === "function") {
        try {
          return String(hostBridge.readClipboardText() || "");
        } catch {
          return "";
        }
      }
      return readBrowserClipboard();
    },
    async writeClipboardText(text) {
      if (!text) return;
      if (typeof hostBridge.writeClipboardText === "function") {
        try {
          hostBridge.writeClipboardText(text);
          return;
        } catch {
          // Fall back to navigator.clipboard if host write fails.
        }
      }
      await writeBrowserClipboard(text);
    },
    resolveDroppedFilePaths(input) {
      return extractDroppedPaths(input, hostBridge.getFilePath);
    },
    subscribeShortcut(listener) {
      if (typeof hostBridge.onShortcut !== "function") {
        return () => undefined;
      }
      return hostBridge.onShortcut(listener);
    },
    async openFileLink(target) {
      const route = buildFileViewerRoute({
        agentKey: target.agentKey,
        path: target.path,
        ...(target.line ? { line: target.line } : {}),
        ...(target.col ? { col: target.col } : {}),
      });
      if (!route) return false;
      if (workPanelBridge) {
        try {
          const capResult = await workPanelBridge.getCapabilities();
          if (capResult.ok && capResult.capabilities.includes("workpanel.open")) {
            const openResult = await workPanelBridge.openItem({
              version: AGENT_WEBCLIENT_BRIDGE_VERSION,
              descriptor: {
                kind: "webclient",
                module: "file",
                route,
                context: {
                  agentKey: target.agentKey,
                  path: target.path,
                },
                title: fileTitleFromPath(target.path),
              },
            });
            return Boolean(openResult.ok);
          }
        } catch {
          return false;
        }
      }
      openFallbackUrl(route);
      return true;
    },
  };
}

export function createTerminalHostAdapter(options: {
  win?: Window;
} = {}): TerminalHostAdapter {
  const win = options.win ?? (typeof window !== "undefined" ? window : undefined);
  const hostBridge = readDesktopTerminalHostBridge(win);
  if (!hostBridge) {
    return createWebTerminalHostAdapter();
  }
  const rawWorkPanel = win?.__AGENT_WEBCLIENT_WORKPANEL_BRIDGE__;
  const workPanelBridge = isDesktopWorkPanelBridge(rawWorkPanel) ? rawWorkPanel : null;
  return createDesktopTerminalHostAdapter({
    hostBridge,
    workPanelBridge,
  });
}

let cachedAdapter: TerminalHostAdapter | null = null;

export function getTerminalHostAdapter(): TerminalHostAdapter {
  if (!cachedAdapter) {
    cachedAdapter = createTerminalHostAdapter();
  }
  return cachedAdapter;
}
