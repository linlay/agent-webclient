import { useEffect, useRef } from "react";

interface DesktopActionPayload {
  action: "openChatHistory";
  data?: unknown;
}

export interface DesktopOpenChatHistoryDetail {
  agentKey: string;
  workerKey: string;
}

interface UseDesktopActionForAgentPageOptions {
  onOpenChatHistory?: (detail: DesktopOpenChatHistoryDetail) => void;
}

function normalizeText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function readOpenChatHistoryDetail(
  data: unknown,
): DesktopOpenChatHistoryDetail | null {
  if (!data || typeof data !== "object") return null;
  const record = data as Record<string, unknown>;
  const agentKey = normalizeText(record.agentKey);
  const workerKey =
    normalizeText(record.workerKey) || (agentKey ? `agent:${agentKey}` : "");
  if (!workerKey) return null;
  return {
    agentKey:
      agentKey || (workerKey.startsWith("agent:") ? workerKey.slice(6) : ""),
    workerKey,
  };
}

export const useDesktopActionForAgentPage = (
  options: UseDesktopActionForAgentPageOptions = {},
) => {
  const onOpenChatHistoryRef = useRef(options.onOpenChatHistory);

  useEffect(() => {
    onOpenChatHistoryRef.current = options.onOpenChatHistory;
  }, [options.onOpenChatHistory]);

  useEffect(() => {
    const electronAPI = (window as any).electronAPI;
    if (!electronAPI) return;

    const handleDesktopAction = (payload: DesktopActionPayload) => {
      if (!payload || payload.action !== "openChatHistory") return;
      const detail = readOpenChatHistoryDetail(payload.data);
      if (!detail) return;

      window.dispatchEvent(
        new CustomEvent("agent:open-worker-history", { detail }),
      );
      onOpenChatHistoryRef.current?.(detail);
    };

    // 监听 主进程 发送的 消息
    const unsubscribe = electronAPI.onFromMain(
      "zenmind:service-webview:action",
      (_: any, payload: DesktopActionPayload) => {
        handleDesktopAction(payload);
      },
    );

    return () => {
      if (typeof unsubscribe === "function") {
        unsubscribe();
      }
    };
  }, []);
};
