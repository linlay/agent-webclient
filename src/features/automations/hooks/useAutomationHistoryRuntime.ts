import { useCallback, useEffect, useRef, useState } from "react";
import { message } from "antd";
import { useAppDispatch, useAppState } from "@/app/state/AppContext";
import { fetchAutomationAgentsForSelect } from "@/features/automations/lib/automationData";
import { buildDuplicateAutomationPayload } from "@/features/automations/lib/automationForm";
import { mergeAutomationExecutionPages } from "@/features/automations/lib/executionView";
import { usePushTransport } from "@/features/transport/hooks/useRealtimeTransport";
import {
  ApiError,
  createAutomation,
  deleteAutomation,
  getAutomation,
  getAutomationExecutions,
  getAutomations,
  toggleAutomation,
  triggerAutomation,
  type AutomationExecutionHistoryStatus,
  type AutomationExecutionResponse,
  type AutomationSummaryResponse,
} from "@/shared/data";
import { useI18n } from "@/shared/i18n";

const EXECUTION_PAGE_SIZE = 20;
const EXECUTION_PUSH_DEBOUNCE_MS = 160;
const HISTORY_RECHECK_MS = 5_000;

const INITIAL_HISTORY_STATUS: AutomationExecutionHistoryStatus = {
  available: false,
  state: "initializing",
};

function readPushPayload(frame: {
  payload?: unknown;
  data?: unknown;
}): Record<string, unknown> {
  const value = frame.payload || frame.data;
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export function useAutomationHistoryRuntime(hasAgentData: boolean) {
  const { t } = useI18n();
  const state = useAppState();
  const dispatch = useAppDispatch();
  const push = usePushTransport();
  const [selectedId, setSelectedId] = useState("");
  const [executions, setExecutions] = useState<AutomationExecutionResponse[]>([]);
  const [executionTotal, setExecutionTotal] = useState(0);
  const [historyStatus, setHistoryStatus] = useState(INITIAL_HISTORY_STATUS);
  const [listLoading, setListLoading] = useState(false);
  const [executionLoading, setExecutionLoading] = useState(false);
  const [moreLoading, setMoreLoading] = useState(false);
  const [listError, setListError] = useState("");
  const [executionError, setExecutionError] = useState("");
  const [actionBusy, setActionBusy] = useState(false);
  const [triggeringIds, setTriggeringIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [viewerExecution, setViewerExecution] =
    useState<AutomationExecutionResponse | null>(null);
  const [viewerRefreshRevision, setViewerRefreshRevision] = useState(0);
  const selectedIdRef = useRef(selectedId);
  const executionsRef = useRef<AutomationExecutionResponse[]>(executions);
  const viewerExecutionRef = useRef<AutomationExecutionResponse | null>(null);
  const viewerTriggerRef = useRef<HTMLElement | null>(null);
  const listRequestRef = useRef(0);
  const executionRequestRef = useRef(0);
  const pushTimerRef = useRef<number | null>(null);
  const viewerPushTimerRef = useRef<number | null>(null);
  const triggeringIdsRef = useRef<Set<string>>(new Set());

  const selected =
    state.automations.find((item) => item.id === selectedId) || null;

  useEffect(() => {
    selectedIdRef.current = selectedId;
  }, [selectedId]);

  useEffect(() => {
    executionsRef.current = executions;
  }, [executions]);

  useEffect(() => {
    viewerExecutionRef.current = viewerExecution;
  }, [viewerExecution]);

  const loadExecutions = useCallback(
    async (automationId: string, replace: boolean, silent = false) => {
      const id = String(automationId || "").trim();
      if (!id) return;
      const request = ++executionRequestRef.current;
      if (!silent) {
        if (replace) setExecutionLoading(true);
        else setMoreLoading(true);
      }
      setExecutionError("");
      try {
        const response = await getAutomationExecutions({
          id,
          limit: EXECUTION_PAGE_SIZE,
          offset: replace ? 0 : executionsRef.current.length,
        });
        if (request !== executionRequestRef.current || id !== selectedIdRef.current) {
          return;
        }
        const incoming = response.data.items || [];
        setExecutions((current) => {
          const next = mergeAutomationExecutionPages(current, incoming, replace);
          executionsRef.current = next;
          return next;
        });
        setExecutionTotal(response.data.total || 0);
      } catch (loadError) {
        if (request !== executionRequestRef.current || id !== selectedIdRef.current) {
          return;
        }
        if (loadError instanceof ApiError && loadError.status === 503) {
          setHistoryStatus({
            available: false,
            state: "unavailable",
            message: loadError.message,
          });
          executionsRef.current = [];
          setExecutions([]);
          setExecutionTotal(0);
        } else {
          setExecutionError(
            loadError instanceof Error ? loadError.message : String(loadError),
          );
        }
      } finally {
        if (request === executionRequestRef.current) {
          setExecutionLoading(false);
          setMoreLoading(false);
        }
      }
    },
    [],
  );

  const loadAutomationList = useCallback(
    async (
      preferredId = "",
      options: { silent?: boolean; loadHistory?: boolean } = {},
    ) => {
      const request = ++listRequestRef.current;
      if (!options.silent) setListLoading(true);
      setListError("");
      try {
        const response = await getAutomations();
        if (request !== listRequestRef.current) return;
        const items = response.data.items || [];
        const status = response.data.executionHistory || INITIAL_HISTORY_STATUS;
        dispatch({ type: "SET_AUTOMATIONS", automations: items });
        setHistoryStatus(status);
        const currentId = preferredId || selectedIdRef.current;
        const nextId = items.some((item) => item.id === currentId)
          ? currentId
          : items[0]?.id || "";
        selectedIdRef.current = nextId;
        setSelectedId(nextId);
        if (!nextId || !status.available) {
          executionsRef.current = [];
          setExecutions([]);
          setExecutionTotal(0);
        } else if (options.loadHistory !== false) {
          await loadExecutions(nextId, true, Boolean(options.silent));
        }
      } catch (loadError) {
        if (request === listRequestRef.current) {
          setListError(loadError instanceof Error ? loadError.message : String(loadError));
        }
      } finally {
        if (request === listRequestRef.current) setListLoading(false);
      }
    },
    [dispatch, loadExecutions],
  );

  useEffect(() => {
    void loadAutomationList();
  }, [loadAutomationList]);

  useEffect(() => {
    if (hasAgentData) return;
    let active = true;
    void fetchAutomationAgentsForSelect()
      .then((items) => {
        if (active) dispatch({ type: "SET_AGENTS", agents: items });
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [dispatch, hasAgentData]);

  useEffect(() => {
    const unsubscribe = push.subscribe(
      {
        types: [
          "automation.execution.created",
          "automation.execution.updated",
          "automation.execution.completed",
        ],
      },
      (frame) => {
        const payload = readPushPayload(frame);
        const automationId = String(payload.automationId || "").trim();
        const executionId = String(payload.executionId || payload.id || "").trim();
        if (pushTimerRef.current !== null) window.clearTimeout(pushTimerRef.current);
        pushTimerRef.current = window.setTimeout(() => {
          pushTimerRef.current = null;
          void loadAutomationList(selectedIdRef.current, {
            silent: true,
            loadHistory: automationId === selectedIdRef.current,
          });
        }, EXECUTION_PUSH_DEBOUNCE_MS);
        if (executionId && executionId === viewerExecutionRef.current?.id) {
          if (viewerPushTimerRef.current !== null) {
            window.clearTimeout(viewerPushTimerRef.current);
          }
          viewerPushTimerRef.current = window.setTimeout(() => {
            viewerPushTimerRef.current = null;
            if (executionId === viewerExecutionRef.current?.id) {
              setViewerRefreshRevision((revision) => revision + 1);
            }
          }, EXECUTION_PUSH_DEBOUNCE_MS);
        }
      },
    );
    return () => {
      unsubscribe();
      if (pushTimerRef.current !== null) window.clearTimeout(pushTimerRef.current);
      if (viewerPushTimerRef.current !== null) {
        window.clearTimeout(viewerPushTimerRef.current);
      }
    };
  }, [loadAutomationList, push]);

  useEffect(() => {
    if (historyStatus.state === "ready") return undefined;
    const recheck = () => {
      if (document.visibilityState === "visible") {
        void loadAutomationList(selectedIdRef.current, { silent: true });
      }
    };
    const timer = window.setInterval(recheck, HISTORY_RECHECK_MS);
    document.addEventListener("visibilitychange", recheck);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", recheck);
    };
  }, [historyStatus.state, loadAutomationList]);

  const selectAutomation = useCallback((id: string) => {
    if (id === selectedIdRef.current) return;
    executionRequestRef.current += 1;
    selectedIdRef.current = id;
    setSelectedId(id);
    executionsRef.current = [];
    setExecutions([]);
    setExecutionTotal(0);
    setExecutionError("");
    if (historyStatus.available) void loadExecutions(id, true);
  }, [historyStatus.available, loadExecutions]);

  const toggleSelected = useCallback(async () => {
    if (!selected || actionBusy) return;
    setActionBusy(true);
    try {
      await toggleAutomation({ id: selected.id, enabled: !selected.enabled });
      await loadAutomationList(selected.id, { silent: true });
    } catch (toggleError) {
      message.error(toggleError instanceof Error ? toggleError.message : String(toggleError));
    } finally {
      setActionBusy(false);
    }
  }, [actionBusy, loadAutomationList, selected]);

  const duplicateSelected = useCallback(async () => {
    if (!selected || actionBusy) return;
    setActionBusy(true);
    try {
      const detail = await getAutomation(selected.id);
      const name = t("automationConsole.copy.name", {
        name: detail.data.name || selected.id,
      });
      const created = await createAutomation(
        buildDuplicateAutomationPayload(detail.data, name),
      );
      await loadAutomationList(created.data.id, { silent: true });
      message.success(t("automationConsole.message.copySuccess", { name }));
    } catch (duplicateError) {
      message.error(
        duplicateError instanceof Error ? duplicateError.message : String(duplicateError),
      );
    } finally {
      setActionBusy(false);
    }
  }, [actionBusy, loadAutomationList, selected, t]);

  const deleteSelected = useCallback(async () => {
    if (!selected || actionBusy) return;
    setActionBusy(true);
    try {
      await deleteAutomation({ id: selected.id });
      await loadAutomationList("", { silent: true });
    } finally {
      setActionBusy(false);
    }
  }, [actionBusy, loadAutomationList, selected]);

  const triggerAutomationItem = useCallback(async (item: AutomationSummaryResponse) => {
    if (triggeringIdsRef.current.has(item.id)) return;
    triggeringIdsRef.current.add(item.id);
    setTriggeringIds(new Set(triggeringIdsRef.current));
    try {
      const response = await triggerAutomation({ id: item.id });
      if (!response.data.accepted) {
        throw new Error(response.data.status || "trigger was not accepted");
      }
      message.success(
        t("automationConsole.message.triggerAccepted", { name: item.name || item.id }),
      );
      void loadAutomationList(selectedIdRef.current, {
        silent: true,
        loadHistory: item.id === selectedIdRef.current,
      });
    } catch (triggerError) {
      if (triggerError instanceof ApiError && triggerError.status === 404) {
        message.error(t("automationConsole.message.triggerUnsupported"));
      } else {
        message.error(
          t("automationConsole.message.triggerFailed", {
            detail:
              triggerError instanceof Error ? triggerError.message : String(triggerError),
          }),
        );
      }
    } finally {
      triggeringIdsRef.current.delete(item.id);
      setTriggeringIds(new Set(triggeringIdsRef.current));
    }
  }, [loadAutomationList, t]);

  const openViewer = useCallback(
    (execution: AutomationExecutionResponse, trigger: HTMLElement) => {
      viewerTriggerRef.current = trigger;
      viewerExecutionRef.current = execution;
      setViewerExecution(execution);
    },
    [],
  );

  const closeViewer = useCallback(() => {
    if (viewerPushTimerRef.current !== null) {
      window.clearTimeout(viewerPushTimerRef.current);
      viewerPushTimerRef.current = null;
    }
    viewerExecutionRef.current = null;
    setViewerExecution(null);
  }, []);

  return {
    actionBusy,
    automations: state.automations,
    closeViewer,
    deleteSelected,
    duplicateSelected,
    executionError,
    executionLoading,
    executions,
    executionTotal,
    historyStatus,
    listError,
    listLoading,
    loadAutomationList,
    loadExecutions,
    moreLoading,
    openViewer,
    selectAutomation,
    selected,
    selectedId,
    toggleSelected,
    triggerAutomationItem,
    triggeringIds,
    viewerExecution,
    viewerRefreshRevision,
    viewerTriggerRef,
  };
}
