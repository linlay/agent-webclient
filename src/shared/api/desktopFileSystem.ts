import {
  hasDesktopHostBridge,
  postDesktopHostMessage,
} from "@/shared/api/desktopHostBridge";
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
      kind: "browser-folder";
      projectName: string;
      files: Array<{
        file: File;
        relativePath: string;
      }>;
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
    return Promise.resolve(null);
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
        if (message) {
          reject(new Error(message));
          return;
        }
        resolve(null);
        return;
      }
      resolve(normalizePath(payload.path) || null);
    };

    const timeoutId = window.setTimeout(() => {
      cleanup(timeoutId);
      resolve(null);
    }, DESKTOP_FILE_SYSTEM_TIMEOUT_MS);

    window.addEventListener("message", handleMessage as EventListener);

    if (!postDesktopHostMessage(requestMessage)) {
      cleanup(timeoutId);
      resolve(null);
    }
  });
}

function readFileRelativePath(file: File): string {
  return normalizePath((file as File & { webkitRelativePath?: string }).webkitRelativePath) ||
    normalizePath(file.name);
}

function readProjectName(files: File[]): string {
  for (const file of files) {
    const relativePath = readFileRelativePath(file);
    const firstSegment = relativePath.split(/[\\/]+/).filter(Boolean)[0];
    if (firstSegment) return firstSegment;
  }
  return "";
}

function selectBrowserProjectFolder(): Promise<ProjectFolderSelection | null> {
  if (typeof document === "undefined") {
    return Promise.reject(
      new ProjectFolderSelectionError(
        "unsupported",
        "browser folder selection is not supported in this environment",
      ),
    );
  }

  return new Promise<ProjectFolderSelection | null>((resolve, reject) => {
    const input = document.createElement("input");
    input.type = "file";
    input.multiple = true;
    if (!("webkitdirectory" in input) && !("directory" in input)) {
      reject(
        new ProjectFolderSelectionError(
          "unsupported",
          "browser folder selection is not supported in this browser",
        ),
      );
      return;
    }
    input.style.position = "fixed";
    input.style.left = "-9999px";
    input.style.top = "0";
    input.style.opacity = "0";
    input.setAttribute("webkitdirectory", "");
    input.setAttribute("directory", "");

    const cleanup = () => {
      input.removeEventListener("change", handleChange);
      input.removeEventListener("cancel", handleCancel);
      if (input.parentNode) {
        input.parentNode.removeChild(input);
      }
    };

    const handleCancel = () => {
      cleanup();
      resolve(null);
    };

    const handleChange = () => {
      const fileList = input.files ? Array.from(input.files) : [];
      cleanup();
      const entries = fileList
        .map((file) => ({
          file,
          relativePath: readFileRelativePath(file),
        }))
        .filter((entry) => entry.relativePath);

      if (entries.length === 0) {
        reject(
          new ProjectFolderSelectionError(
            "empty",
            "selected folder is empty or the browser did not expose readable files",
          ),
        );
        return;
      }

      const projectName = readProjectName(fileList);
      if (!projectName) {
        reject(
          new ProjectFolderSelectionError(
            "empty",
            "selected folder did not include a project name",
          ),
        );
        return;
      }

      resolve({
        kind: "browser-folder",
        projectName,
        files: entries,
      });
    };

    input.addEventListener("change", handleChange);
    input.addEventListener("cancel", handleCancel);
    document.body.appendChild(input);

    try {
      input.click();
    } catch (error) {
      cleanup();
      reject(
        new ProjectFolderSelectionError(
          "unsupported",
          (error as Error).message || "browser folder selection failed",
        ),
      );
    }
  });
}

export async function selectProjectFolder(): Promise<ProjectFolderSelection | null> {
  if (isDesktopAppMode()) {
    const workspaceDir = await selectWorkspaceDirectory();
    return workspaceDir ? { kind: "desktop-directory", workspaceDir } : null;
  }
  return selectBrowserProjectFolder();
}

export function openWorkspaceDirectory(path: string): Promise<boolean> {
  const normalizedPath = normalizePath(path);
  if (!normalizedPath || !canUseDesktopFileSystemBridge()) {
    return Promise.resolve(false);
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
      resolve(false);
    }, DESKTOP_FILE_SYSTEM_TIMEOUT_MS);

    window.addEventListener("message", handleMessage as EventListener);

    if (!postDesktopHostMessage(requestMessage)) {
      cleanup(timeoutId);
      resolve(false);
    }
  });
}
