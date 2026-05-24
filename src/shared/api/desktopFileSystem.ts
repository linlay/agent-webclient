import {
  hasDesktopHostBridge,
  postDesktopHostMessage,
} from "@/shared/api/desktopHostBridge";
import { openAgentWorkspace } from "@/shared/api/apiClient";
import { isDesktopAppMode } from "@/shared/utils/routing";

const SELECT_DIRECTORY_REQUEST_TYPE = "zenmind:desktop-dialog:select-directory";
const SELECT_DIRECTORY_RESPONSE_TYPE = "zenmind:desktop-dialog:select-directory:response";
const OPEN_PATH_REQUEST_TYPE = "zenmind:desktop-shell:open-path";
const OPEN_PATH_RESPONSE_TYPE = "zenmind:desktop-shell:open-path:response";
const DESKTOP_FILE_SYSTEM_TIMEOUT_MS = 30_000;

export type ProjectFolderSelection =
  | {
      kind: "desktop-directory";
      workspaceDir: string;
    }
  | {
      kind: "browser-directory-path";
      workspaceDir: string;
    };

export class ProjectFolderSelectionError extends Error {
  code: "unsupported" | "empty";

  constructor(code: "unsupported" | "empty", message: string) {
    super(message);
    this.name = "ProjectFolderSelectionError";
    this.code = code;
  }
}

interface SelectDirectoryRequestMessage {
  type: typeof SELECT_DIRECTORY_REQUEST_TYPE;
  requestId: string;
  mode: "directory";
}

interface SelectDirectoryResponseMessage {
  type: typeof SELECT_DIRECTORY_RESPONSE_TYPE;
  requestId: string;
  ok?: boolean;
  path?: string;
  message?: string;
}

interface OpenPathRequestMessage {
  type: typeof OPEN_PATH_REQUEST_TYPE;
  requestId: string;
  path: string;
}

interface OpenPathResponseMessage {
  type: typeof OPEN_PATH_RESPONSE_TYPE;
  requestId: string;
  ok?: boolean;
  message?: string;
}

function createDesktopFileSystemRequestId(): string {
  return `desktop_fs_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function canUseDesktopFileSystemBridge(): boolean {
  return (
    typeof window !== "undefined" &&
    isDesktopAppMode() &&
    hasDesktopHostBridge()
  );
}

function normalizePath(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function selectWorkspaceDirectory(): Promise<string | null> {
  if (!canUseDesktopFileSystemBridge()) {
    return Promise.reject(
      new ProjectFolderSelectionError(
        "unsupported",
        "desktop directory selection bridge is not available",
      ),
    );
  }

  return new Promise<string | null>((resolve, reject) => {
    const requestId = createDesktopFileSystemRequestId();
    const requestMessage: SelectDirectoryRequestMessage = {
      type: SELECT_DIRECTORY_REQUEST_TYPE,
      requestId,
      mode: "directory",
    };

    const cleanup = (timeoutId: number) => {
      window.clearTimeout(timeoutId);
      window.removeEventListener("message", handleMessage as EventListener);
    };

    const handleMessage = (event: MessageEvent) => {
      const payload = event.data as SelectDirectoryResponseMessage | null;
      if (
        !payload ||
        payload.type !== SELECT_DIRECTORY_RESPONSE_TYPE ||
        payload.requestId !== requestId
      ) {
        return;
      }

      cleanup(timeoutId);
      if (!payload.ok) {
        const message = normalizePath(payload.message);
        reject(new Error(message || "desktop directory selection failed"));
        return;
      }
      const selectedPath = normalizePath(payload.path);
      if (!selectedPath) {
        reject(new Error("desktop directory selection returned empty path"));
        return;
      }
      resolve(selectedPath);
    };

    const timeoutId = window.setTimeout(() => {
      cleanup(timeoutId);
      reject(new Error("desktop directory selection timed out"));
    }, DESKTOP_FILE_SYSTEM_TIMEOUT_MS);

    window.addEventListener("message", handleMessage as EventListener);

    if (!postDesktopHostMessage(requestMessage)) {
      cleanup(timeoutId);
      reject(new Error("desktop directory selection request failed"));
    }
  });
}

function selectBrowserProjectFolder(): Promise<ProjectFolderSelection | null> {
  if (typeof window === "undefined" || typeof window.prompt !== "function") {
    return Promise.reject(
      new ProjectFolderSelectionError(
        "unsupported",
        "browser workspace path input is not supported in this environment",
      ),
    );
  }
  const workspaceDir = normalizePath(
    window.prompt("请输入本机项目目录的绝对路径", ""),
  );
  if (!workspaceDir) return Promise.resolve(null);
  return Promise.resolve({ kind: "browser-directory-path", workspaceDir });
}

export async function selectProjectFolder(): Promise<ProjectFolderSelection | null> {
  if (isDesktopAppMode()) {
    const workspaceDir = await selectWorkspaceDirectory();
    return workspaceDir ? { kind: "desktop-directory", workspaceDir } : null;
  }
  return selectBrowserProjectFolder();
}

export async function openWorkspaceDirectory(path: string, agentKey?: string): Promise<boolean> {
  const normalizedPath = normalizePath(path);
  const normalizedAgentKey = normalizePath(agentKey);
  if (!normalizedPath && !normalizedAgentKey) {
    return false;
  }
  if (!canUseDesktopFileSystemBridge()) {
    const response = await openAgentWorkspace({
      agentKey: normalizedAgentKey || undefined,
      workspaceDir: normalizedAgentKey ? undefined : normalizedPath,
    });
    return Boolean(response.data?.opened);
  }

  return new Promise<boolean>((resolve, reject) => {
    const requestId = createDesktopFileSystemRequestId();
    const requestMessage: OpenPathRequestMessage = {
      type: OPEN_PATH_REQUEST_TYPE,
      requestId,
      path: normalizedPath,
    };

    const cleanup = (timeoutId: number) => {
      window.clearTimeout(timeoutId);
      window.removeEventListener("message", handleMessage as EventListener);
    };

    const handleMessage = (event: MessageEvent) => {
      const payload = event.data as OpenPathResponseMessage | null;
      if (
        !payload ||
        payload.type !== OPEN_PATH_RESPONSE_TYPE ||
        payload.requestId !== requestId
      ) {
        return;
      }

      cleanup(timeoutId);
      if (payload.ok) {
        resolve(true);
        return;
      }
      reject(new Error(normalizePath(payload.message) || "open path failed"));
    };

    const timeoutId = window.setTimeout(() => {
      cleanup(timeoutId);
      reject(new Error("desktop open path request timed out"));
    }, DESKTOP_FILE_SYSTEM_TIMEOUT_MS);

    window.addEventListener("message", handleMessage as EventListener);

    if (!postDesktopHostMessage(requestMessage)) {
      cleanup(timeoutId);
      reject(new Error("desktop open path request failed"));
    }
  });
}
