import React, { useCallback, useEffect, useMemo, useRef } from "react";
import { Modal } from "antd";
import {
  getMemoryMeta,
  getMemoryRecord,
  getMemoryRecords,
  getMemoryScope,
  getMemoryScopes,
  previewMemoryContext,
  saveMemoryScope,
  validateMemoryScope,
} from "@/shared/data";
import type {
  MemoryConsoleTab,
  MemoryContextPreviewResponse,
  MemoryContextPromptLayer,
  MemoryInfoFilters,
  MemoryMeta,
  MemoryPreferenceMode,
  MemoryPreferenceScopeType,
  MemoryRecordDetail,
  MemoryRecordListItem,
  MemoryScopeDetailMeta,
  MemoryScopeDraftRecord,
  MemoryScopeSaveSummary,
  MemoryScopeSummary,
  MemoryScopeValidationResult,
} from "@/shared/data/memory/memoryTypes";
import { UiButton } from "@/shared/ui/UiButton";
import { UiTag } from "@/shared/ui/UiTag";
import { MaterialIcon } from "@/shared/ui/MaterialIcon";
import { useI18n } from "@/shared/i18n";
import {
  createMemoryPreferenceDraftRecord,
  formatMemoryJson,
  formatMemoryTimestamp,
  formatScopeTabLabel,
  hydratePreferenceDrafts,
  normalizeMemoryTagList,
  normalizePreferenceScopeType,
  preferredScopeTypeFromSummaries,
  resolveMemoryAgentContext,
  resolveMemoryPreviewContext,
  syncSelectedPreferenceDraftFromLiveValues,
  toScopeRecordInputs,
} from "@/features/memory/lib/memoryInfo";
import { toText } from "@/shared/utils/eventUtils";
import { useMemoryRuntime } from "@/features/memory/hooks/useMemoryRuntime";
import "./MemoryConsole.module.css";
import {
  MemoryRecordsPanelView,
  type MemoryInfoFilterField,
  type MemoryRecordsPanelProps,
} from "@/features/memory/components/MemoryRecordsPanel";
import {
  MemoryPreferencesPanelView,
  type MemoryPreferencesPanelProps,
  type PreferenceRecordField,
} from "@/features/memory/components/MemoryPreferencesPanel";
import {
  MemoryPreviewPanelView,
  type MemoryPreviewPanelProps,
} from "@/features/memory/components/MemoryPreviewPanel";
import {
  PREFERENCE_SCOPE_ORDER,
  PREVIEW_PROMPT_LAYER_ORDER,
  MEMORY_INFO_CARD_CLASS_NAME,
  MEMORY_HEAD_CLASS_NAME,
  MEMORY_SUBTITLE_CLASS_NAME,
  MEMORY_CONSOLE_TABS_CLASS_NAME,
  MEMORY_CONSOLE_PANE_CLASS_NAME,
  MEMORY_INFO_LAYOUT_CLASS_NAME,
  MEMORY_INFO_PANE_CLASS_NAME,
  MEMORY_INFO_PANE_HEADER_CLASS_NAME,
  MEMORY_INFO_PANE_HINT_CLASS_NAME,
  MEMORY_INFO_ACTIONS_CLASS_NAME,
  MEMORY_FILTER_GRID_CLASS_NAME,
  MEMORY_PANE_LIST_FILTER_GRID_CLASS_NAME,
  MEMORY_FIELD_CLASS_NAME,
  MEMORY_PANE_LIST_FIELD_CLASS_NAME,
  MEMORY_FIELD_WIDE_CLASS_NAME,
  MEMORY_INFO_INPUT_CLASS_NAME,
  MEMORY_INFO_SELECT_CLASS_NAME,
  MEMORY_INFO_ERROR_CLASS_NAME,
  COMMAND_EMPTY_STATE_CLASS_NAME,
  COMMAND_DETAIL_LABEL_CLASS_NAME,
  SETTINGS_SEGMENTED_BUTTON_CLASS_NAME,
  MEMORY_INFO_RECORD_LIST_CLASS_NAME,
  MEMORY_INFO_RECORD_ITEM_CLASS_NAME,
  MEMORY_RECORD_HEAD_CLASS_NAME,
  MEMORY_RECORD_META_CLASS_NAME,
  MEMORY_RECORD_SUMMARY_CLASS_NAME,
  MEMORY_DETAIL_STACK_CLASS_NAME,
  MEMORY_DETAIL_TITLE_CLASS_NAME,
  MEMORY_DETAIL_BADGES_CLASS_NAME,
  MEMORY_DETAIL_SUMMARY_CLASS_NAME,
  MEMORY_DETAIL_GRID_CLASS_NAME,
  MEMORY_DETAIL_CARD_CLASS_NAME,
  MEMORY_DETAIL_BLOCK_CLASS_NAME,
  MEMORY_RAW_BLOCK_CLASS_NAME,
  MEMORY_RAW_SUMMARY_CLASS_NAME,
  MEMORY_PREVIEW_LAYOUT_CLASS_NAME,
  MEMORY_PREVIEW_PANE_INPUT_CLASS_NAME,
  MEMORY_PREVIEW_PANE_RESULT_CLASS_NAME,
  MEMORY_PREVIEW_CONTEXT_LIST_CLASS_NAME,
  MEMORY_PREVIEW_CONTEXT_ITEM_CLASS_NAME,
  MEMORY_PREVIEW_TEXTAREA_CLASS_NAME,
  MEMORY_PREVIEW_SUMMARY_GRID_CLASS_NAME,
  MEMORY_PREVIEW_LAYER_TABS_CLASS_NAME,
  MEMORY_PREVIEW_LAYER_TAB_CLASS_NAME,
  MEMORY_PREVIEW_PROMPT_BLOCK_CLASS_NAME,
  MEMORY_PREVIEW_LIST_CLASS_NAME,
  MEMORY_PREVIEW_ITEM_CARD_CLASS_NAME,
  MEMORY_PREVIEW_HEAD_CLASS_NAME,
  MEMORY_PREVIEW_EMPTY_CLASS_NAME,
  MEMORY_PREFERENCE_SCOPE_TABS_CLASS_NAME,
  MEMORY_PREFERENCE_SCOPE_TAB_CLASS_NAME,
  MEMORY_PREFERENCE_LAYOUT_CLASS_NAME,
  MEMORY_PREFERENCE_PANE_LIST_CLASS_NAME,
  MEMORY_PREFERENCE_PANE_DETAIL_CLASS_NAME,
  MEMORY_PREFERENCE_PANE_EDITOR_CLASS_NAME,
  MEMORY_PREFERENCE_MODE_TOGGLE_CLASS_NAME,
  MEMORY_PREFERENCE_FORM_CLASS_NAME,
  MEMORY_PREFERENCE_FORM_GRID_CLASS_NAME,
  MEMORY_PREFERENCE_TEXTAREA_CLASS_NAME,
  MEMORY_PREFERENCE_MARKDOWN_PANEL_CLASS_NAME,
  MEMORY_PREFERENCE_MARKDOWN_CLASS_NAME,
  MEMORY_PREFERENCE_MARKDOWN_HINT_CLASS_NAME,
  MEMORY_PREFERENCE_VALIDATION_CLASS_NAME,
  MEMORY_PREFERENCE_VALIDATION_ITEM_CLASS_BY_KIND,
  MEMORY_PREFERENCE_RECORD_ROW_CLASS_NAME,
  MEMORY_PREFERENCE_RECORD_MAIN_CLASS_NAME,
  MEMORY_PREFERENCE_RECORD_MARKER_CLASS_NAME,
  MEMORY_PREFERENCE_RECORD_BODY_CLASS_NAME,
  MEMORY_PREFERENCE_RECORD_TOPLINE_CLASS_NAME,
  MEMORY_PREFERENCE_RECORD_SUMMARY_CLASS_NAME,
  MEMORY_PREFERENCE_RECORD_META_CLASS_NAME,
  MEMORY_PREFERENCE_RECORD_DELETE_CLASS_NAME,
  MEMORY_INFO_BANNER_CLASS_BY_TONE,
  toneForStatus,
  formatDetailValue,
  mergeMemoryMetaOptions,
  promptToneForLayer,
  formatPreviewLayerLabel,
  renderMemoryDetailRows,
  renderPreferenceInspectorRows,
  buildFallbackScopeSummaries,
  formatValidationFieldLabel,
  formatValidationMessage,
} from "@/features/memory/lib/memoryPanelPresentation";

export interface MemoryInfoConsoleViewProps {
  title: string;
  subtitle: string;
  activeTab: MemoryConsoleTab;
  onTabChange: (tab: MemoryConsoleTab) => void;
  cardClassName?: string;
  recordsPanel: MemoryRecordsPanelProps;
  preferencesPanel: MemoryPreferencesPanelProps;
  previewPanel: MemoryPreviewPanelProps;
}

export interface MemoryInfoModalViewProps extends MemoryInfoConsoleViewProps {
  open: boolean;
  onClose: () => void;
}

export const MemoryInfoConsoleView: React.FC<MemoryInfoConsoleViewProps> = ({
  title,
  subtitle,
  activeTab,
  onTabChange,
  cardClassName = "",
  recordsPanel,
  preferencesPanel,
  previewPanel,
}) => {
  const { t } = useI18n();

  return (
    <div
      className={`${MEMORY_INFO_CARD_CLASS_NAME} ${cardClassName}`.trim()}
    >
      <div className={MEMORY_HEAD_CLASS_NAME}>
        <div>
          <h3>{title}</h3>
          <p className={MEMORY_SUBTITLE_CLASS_NAME}>{subtitle}</p>
        </div>
      </div>

      <div className={MEMORY_CONSOLE_TABS_CLASS_NAME}>
        <UiButton
          variant="ghost"
          size="sm"
          className={SETTINGS_SEGMENTED_BUTTON_CLASS_NAME}
          active={activeTab === "preferences"}
          onClick={() => onTabChange("preferences")}
        >
          {t("memoryPreferences.tab")}
        </UiButton>
        <UiButton
          variant="ghost"
          size="sm"
          className={SETTINGS_SEGMENTED_BUTTON_CLASS_NAME}
          active={activeTab === "preview"}
          onClick={() => onTabChange("preview")}
        >
          {t("memoryPreview.tab")}
        </UiButton>
        <UiButton
          variant="ghost"
          size="sm"
          className={SETTINGS_SEGMENTED_BUTTON_CLASS_NAME}
          active={activeTab === "records"}
          onClick={() => onTabChange("records")}
        >
          {t("memoryInfo.tab")}
        </UiButton>
      </div>

      {activeTab === "preferences" ? (
        <MemoryPreferencesPanelView {...preferencesPanel} />
      ) : activeTab === "preview" ? (
        <MemoryPreviewPanelView {...previewPanel} />
      ) : (
        <MemoryRecordsPanelView {...recordsPanel} />
      )}
    </div>
  );
};

export const MemoryInfoModalView: React.FC<MemoryInfoModalViewProps> = ({
  open,
  onClose,
  ...consoleProps
}) => {
  if (!open) {
    return null;
  }

  return (
    <Modal
      open={open}
      onCancel={onClose}
      centered
      footer={null}
      destroyOnHidden
      getContainer={false}
      width="min(1220px, calc(100vw - 36px))"
      className="memory-info-modal"
    >
      <MemoryInfoConsoleView {...consoleProps} />
    </Modal>
  );
};

function createEmptyPreferenceStateUpdates() {
  return {
    memoryPreferenceScopes: [],
    memoryPreferenceActiveScopeType: "agent",
    memoryPreferenceActiveScopeKey: "",
    memoryPreferenceLabel: "AGENT",
    memoryPreferenceFileName: "AGENT.md",
    memoryPreferenceMeta: null,
    memoryPreferenceLoading: false,
    memoryPreferenceError: "",
    memoryPreferenceMarkdownDraft: "",
    memoryPreferenceRecordsDraft: [],
    memoryPreferenceSelectedRecordId: "",
    memoryPreferenceDirty: false,
    memoryPreferenceSaving: false,
    memoryPreferenceSaveSummary: null,
    memoryPreferenceValidation: null,
  };
}

export interface MemoryInfoConsoleProps {
  open?: boolean;
  onClose?: () => void;
  surface?: "modal" | "page";
}

export const MemoryInfoConsole: React.FC<MemoryInfoConsoleProps> = ({
  open = true,
  onClose,
  surface = "page",
}) => {
  const { state, dispatch, t } = useMemoryRuntime();
  const listRequestSeqRef = useRef(0);
  const detailRequestSeqRef = useRef(0);
  const preferenceScopesSeqRef = useRef(0);
  const preferenceScopeSeqRef = useRef(0);
  const metaLoadAttemptedRef = useRef(false);
  const previewAutoTriggeredRef = useRef(false);
  const preferencesLoadSignatureRef = useRef("");
  const preferenceTitleInputRef = useRef<HTMLInputElement>(null);
  const preferenceSummaryTextareaRef = useRef<HTMLTextAreaElement>(null);
  const preferenceCategoryInputRef = useRef<HTMLSelectElement>(null);
  const preferenceImportanceInputRef = useRef<HTMLInputElement>(null);
  const preferenceConfidenceInputRef = useRef<HTMLInputElement>(null);
  const preferenceTagsInputRef = useRef<HTMLInputElement>(null);
  const preferenceMarkdownTextareaRef = useRef<HTMLTextAreaElement>(null);
  const agentContext = useMemo(
    () =>
      resolveMemoryAgentContext({
        agents: state.agents,
        teams: state.teams,
        chats: state.chats,
        chatId: state.chatId,
        chatAgentById: state.chatAgentById,
        workerSelectionKey: state.workerSelectionKey,
        workerIndexByKey: state.workerIndexByKey,
        workerRows: state.workerRows,
        workerRelatedChats: state.workerRelatedChats,
      }),
    [
      state.agents,
      state.teams,
      state.chats,
      state.chatId,
      state.chatAgentById,
      state.workerSelectionKey,
      state.workerIndexByKey,
      state.workerRows,
      state.workerRelatedChats,
    ],
  );
  const previewContext = useMemo(
    () =>
      resolveMemoryPreviewContext({
        chatId: state.chatId,
        chats: state.chats,
        workerSelectionKey: state.workerSelectionKey,
        workerIndexByKey: state.workerIndexByKey,
        workerRows: state.workerRows,
        workerRelatedChats: state.workerRelatedChats,
      }),
    [
      state.chatId,
      state.chats,
      state.workerSelectionKey,
      state.workerIndexByKey,
      state.workerRows,
      state.workerRelatedChats,
    ],
  );
  const currentChat = useMemo(
    () =>
      state.chats.find((chat) => toText(chat.chatId) === toText(state.chatId)) ||
      null,
    [state.chatId, state.chats],
  );
  const previewChatId = toText(previewContext.chatId);
  const previewTeamId = toText(currentChat?.teamId) || toText(previewContext.teamId);

  const closeModal = useCallback(() => {
    onClose?.();
  }, [onClose]);

  const updateFilter = useCallback(
    (field: MemoryInfoFilterField, value: string) => {
      const nextValue =
        field === "limit"
          ? Math.max(1, Math.min(100, Number.parseInt(value || "20", 10) || 20))
          : value;
      dispatch({
        type: "SET_MEMORY_INFO_FILTERS",
        filters: { [field]: nextValue },
      });
    },
    [dispatch],
  );

  const loadMemoryMeta = useCallback(async () => {
    if (state.memoryMeta || metaLoadAttemptedRef.current) {
      return;
    }
    metaLoadAttemptedRef.current = true;
    try {
      const response = await getMemoryMeta();
      dispatch({ type: "SET_MEMORY_META", meta: response.data });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      dispatch({
        type: "APPEND_DEBUG",
        line: `[memory meta] ${message}`,
      });
    }
  }, [dispatch, state.memoryMeta]);

  const runMemoryPreview = useCallback(
    async (messageOverride?: string) => {
      const chatId = previewChatId;
      const message = toText(
        messageOverride !== undefined
          ? messageOverride
          : state.memoryPreviewDraft,
      );
      if (!chatId || !message) {
        return;
      }
      dispatch({
        type: "BATCH_UPDATE",
        updates: {
          memoryPreviewLoading: true,
          memoryPreviewError: "",
          memoryPreviewResult: null,
        },
      });
      try {
        const response = await previewMemoryContext({ chatId, message });
        dispatch({
          type: "BATCH_UPDATE",
          updates: {
            memoryPreviewLoading: false,
            memoryPreviewError: "",
            memoryPreviewResult: response.data,
          },
        });
      } catch (error) {
        const messageText =
          error instanceof Error ? error.message : String(error);
        dispatch({
          type: "BATCH_UPDATE",
          updates: {
            memoryPreviewLoading: false,
            memoryPreviewError: t("memoryPreview.errors.load", {
              detail: messageText,
            }),
            memoryPreviewResult: null,
          },
        });
      }
    },
    [dispatch, previewChatId, state.memoryPreviewDraft, t],
  );

  const loadDetail = useCallback(
    async (id: string, agentKeyOverride?: string) => {
      const agentKey = toText(agentKeyOverride) || agentContext.agentKey;
      if (!id) {
        dispatch({ type: "SET_MEMORY_INFO_DETAIL", detail: null });
        dispatch({ type: "SET_MEMORY_INFO_DETAIL_ERROR", error: "" });
        dispatch({ type: "SET_MEMORY_INFO_DETAIL_LOADING", loading: false });
        return;
      }

      const seq = ++detailRequestSeqRef.current;
      dispatch({ type: "SET_MEMORY_INFO_DETAIL_LOADING", loading: true });
      dispatch({ type: "SET_MEMORY_INFO_DETAIL_ERROR", error: "" });

      try {
        let response: Awaited<ReturnType<typeof getMemoryRecord>>;
        try {
          response = await getMemoryRecord(agentKey || undefined, id);
        } catch (error) {
          if (!agentKey) {
            throw error;
          }
          response = await getMemoryRecord(undefined, id);
        }
        if (seq !== detailRequestSeqRef.current) return;
        dispatch({ type: "SET_MEMORY_INFO_DETAIL", detail: response.data });
      } catch (error) {
        if (seq !== detailRequestSeqRef.current) return;
        const message = error instanceof Error ? error.message : String(error);
        dispatch({
          type: "SET_MEMORY_INFO_DETAIL_ERROR",
          error: t("memoryInfo.errors.loadDetail", { detail: message }),
        });
        dispatch({ type: "SET_MEMORY_INFO_DETAIL", detail: null });
      } finally {
        if (seq === detailRequestSeqRef.current) {
          dispatch({ type: "SET_MEMORY_INFO_DETAIL_LOADING", loading: false });
        }
      }
    },
    [agentContext.agentKey, dispatch, t],
  );

  const loadRecords = useCallback(async () => {
    const seq = ++listRequestSeqRef.current;
    dispatch({ type: "SET_MEMORY_INFO_LOADING", loading: true });
    dispatch({ type: "SET_MEMORY_INFO_ERROR", error: "" });

    try {
      const baseRequest = {
        keyword: state.memoryInfoFilters.keyword,
        kind: state.memoryInfoFilters.kind,
        scopeType: state.memoryInfoFilters.scopeType,
        status: state.memoryInfoFilters.status,
        category: state.memoryInfoFilters.category,
        limit: state.memoryInfoFilters.limit,
      };
      const hasExplicitFilter = Boolean(
        toText(baseRequest.keyword) ||
          toText(baseRequest.kind) ||
          toText(baseRequest.scopeType) ||
          toText(baseRequest.status) ||
          toText(baseRequest.category),
      );
      let response = await getMemoryRecords({
        agentKey: agentContext.agentKey || undefined,
        ...baseRequest,
      });
      if (
        agentContext.agentKey &&
        !hasExplicitFilter &&
        (!Array.isArray(response.data?.results) ||
          response.data.results.length === 0)
      ) {
        response = await getMemoryRecords(baseRequest);
      }
      if (seq !== listRequestSeqRef.current) return;
      const records = Array.isArray(response.data?.results)
        ? response.data.results
        : [];
      const nextSelectedRecordId = records.some(
        (item) => item.id === state.memoryInfoSelectedRecordId,
      )
        ? state.memoryInfoSelectedRecordId
        : records[0]?.id || "";
      const nextSelectedRecord = records.find(
        (item) => item.id === nextSelectedRecordId,
      );

      dispatch({
        type: "SET_MEMORY_INFO_RECORDS",
        records,
        nextCursor: response.data?.nextCursor || "",
        selectedRecordId: nextSelectedRecordId,
      });

      if (!nextSelectedRecordId) {
        dispatch({ type: "SET_MEMORY_INFO_DETAIL", detail: null });
        dispatch({ type: "SET_MEMORY_INFO_DETAIL_ERROR", error: "" });
        dispatch({ type: "SET_MEMORY_INFO_DETAIL_LOADING", loading: false });
        return;
      }

      if (
        state.memoryInfoDetail?.id !== nextSelectedRecordId ||
        detailRequestSeqRef.current === 0
      ) {
        void loadDetail(
          nextSelectedRecordId,
          nextSelectedRecord?.agentKey || agentContext.agentKey || undefined,
        );
      }
    } catch (error) {
      if (seq !== listRequestSeqRef.current) return;
      const message = error instanceof Error ? error.message : String(error);
      dispatch({
        type: "SET_MEMORY_INFO_ERROR",
        error: t("memoryInfo.errors.loadRecords", { detail: message }),
      });
      dispatch({
        type: "SET_MEMORY_INFO_RECORDS",
        records: [],
        nextCursor: "",
        selectedRecordId: "",
      });
      dispatch({ type: "SET_MEMORY_INFO_DETAIL", detail: null });
    } finally {
      if (seq === listRequestSeqRef.current) {
        dispatch({ type: "SET_MEMORY_INFO_LOADING", loading: false });
      }
    }
  }, [
    agentContext.agentKey,
    dispatch,
    loadDetail,
    state.memoryInfoDetail?.id,
    state.memoryInfoFilters.category,
    state.memoryInfoFilters.keyword,
    state.memoryInfoFilters.kind,
    state.memoryInfoFilters.limit,
    state.memoryInfoFilters.scopeType,
    state.memoryInfoFilters.status,
    state.memoryInfoSelectedRecordId,
    t,
  ]);

  const loadPreferenceScope = useCallback(
    async (
      scopeType: MemoryPreferenceScopeType,
      scopeKey?: string,
      options: {
        preserveSaveSummary?: boolean;
        preserveValidation?: boolean;
      } = {},
    ) => {
      if (!agentContext.agentKey) {
        dispatch({
          type: "BATCH_UPDATE",
          updates: createEmptyPreferenceStateUpdates(),
        });
        return;
      }

      const seq = ++preferenceScopeSeqRef.current;
      dispatch({
        type: "BATCH_UPDATE",
        updates: {
          memoryPreferenceLoading: true,
          memoryPreferenceError: "",
          ...(options.preserveSaveSummary
            ? {}
            : { memoryPreferenceSaveSummary: null }),
          ...(options.preserveValidation
            ? {}
            : { memoryPreferenceValidation: null }),
        },
      });

      try {
        const response = await getMemoryScope(
          agentContext.agentKey,
          scopeType,
          scopeKey,
        );
        if (seq !== preferenceScopeSeqRef.current) return;
        const detail = response.data;
        const drafts = hydratePreferenceDrafts(detail.records || []);
        dispatch({
          type: "BATCH_UPDATE",
          updates: {
            memoryPreferenceActiveScopeType:
              normalizePreferenceScopeType(detail.scopeType),
            memoryPreferenceActiveScopeKey: detail.scopeKey,
            memoryPreferenceLabel: detail.label,
            memoryPreferenceFileName: detail.fileName,
            memoryPreferenceMeta: detail.meta,
            memoryPreferenceMarkdownDraft: detail.markdown,
            memoryPreferenceRecordsDraft: drafts,
            memoryPreferenceSelectedRecordId: drafts[0]?.clientId || "",
            memoryPreferenceDirty: false,
            memoryPreferenceLoading: false,
            memoryPreferenceError: "",
          },
        });
      } catch (error) {
        if (seq !== preferenceScopeSeqRef.current) return;
        const message = error instanceof Error ? error.message : String(error);
        dispatch({
          type: "BATCH_UPDATE",
          updates: {
            memoryPreferenceLoading: false,
            memoryPreferenceError: t("memoryPreferences.errors.loadScope", {
              detail: message,
            }),
          },
        });
      }
    },
    [agentContext.agentKey, dispatch, t],
  );

  const loadPreferenceScopes = useCallback(
    async (preferredScopeType?: MemoryPreferenceScopeType) => {
      if (!agentContext.agentKey) {
        dispatch({
          type: "BATCH_UPDATE",
          updates: createEmptyPreferenceStateUpdates(),
        });
        return;
      }

      const seq = ++preferenceScopesSeqRef.current;
      dispatch({
        type: "BATCH_UPDATE",
        updates: {
          memoryPreferenceLoading: true,
          memoryPreferenceError: "",
          memoryPreferenceSaveSummary: null,
          memoryPreferenceValidation: null,
        },
      });

      try {
        const response = await getMemoryScopes(agentContext.agentKey);
        if (seq !== preferenceScopesSeqRef.current) return;
        const scopes = Array.isArray(response.data?.scopes)
          ? response.data.scopes
          : [];
        const targetScopeType =
          preferredScopeType || preferredScopeTypeFromSummaries(scopes);
        dispatch({ type: "SET_MEMORY_PREFERENCE_SCOPES", scopes });
        const matchedScope =
          scopes.find(
            (scope) =>
              normalizePreferenceScopeType(scope.scopeType) === targetScopeType,
          ) || null;
        await loadPreferenceScope(targetScopeType, matchedScope?.scopeKey);
      } catch (error) {
        if (seq !== preferenceScopesSeqRef.current) return;
        const message = error instanceof Error ? error.message : String(error);
        dispatch({
          type: "BATCH_UPDATE",
          updates: {
            memoryPreferenceLoading: false,
            memoryPreferenceError: t("memoryPreferences.errors.loadScopes", {
              detail: message,
            }),
          },
        });
      }
    },
    [agentContext.agentKey, dispatch, loadPreferenceScope, t],
  );

  const handlePreferenceScopeSelect = useCallback(
    (scopeType: MemoryPreferenceScopeType) => {
      if (state.memoryPreferenceDirty) {
        dispatch({
          type: "SET_MEMORY_PREFERENCE_ERROR",
          error: t("memoryPreferences.notice.unsaved"),
        });
        return;
      }
      const matchedScope =
        state.memoryPreferenceScopes.find(
          (scope) => normalizePreferenceScopeType(scope.scopeType) === scopeType,
        ) || null;
      void loadPreferenceScope(scopeType, matchedScope?.scopeKey);
    },
    [
      dispatch,
      loadPreferenceScope,
      state.memoryPreferenceDirty,
      state.memoryPreferenceScopes,
      t,
    ],
  );

  const handlePreferenceModeChange = useCallback(
    (mode: MemoryPreferenceMode) => {
      dispatch({ type: "SET_MEMORY_PREFERENCE_MODE", mode });
      dispatch({ type: "SET_MEMORY_PREFERENCE_ERROR", error: "" });
      dispatch({ type: "SET_MEMORY_PREFERENCE_VALIDATION", validation: null });
    },
    [dispatch],
  );

  const handlePreferenceMarkdownChange = useCallback(
    (markdown: string) => {
      dispatch({
        type: "BATCH_UPDATE",
        updates: {
          memoryPreferenceMarkdownDraft: markdown,
          memoryPreferenceDirty: true,
          memoryPreferenceError: "",
          memoryPreferenceSaveSummary: null,
          memoryPreferenceValidation: null,
        },
      });
    },
    [dispatch],
  );

  const handlePreferenceRecordFieldChange = useCallback(
    (field: PreferenceRecordField, value: string) => {
      const selectedId = state.memoryPreferenceSelectedRecordId;
      if (!selectedId) return;
      const nextRecords = state.memoryPreferenceRecordsDraft.map((record) => {
        if (record.clientId !== selectedId) {
          return record;
        }
        switch (field) {
          case "importance":
            return {
              ...record,
              importance: Number.parseInt(value || "0", 10) || 0,
            };
          case "confidence":
            return {
              ...record,
              confidence: Number.parseFloat(value || "0") || 0,
            };
          case "tags":
            return {
              ...record,
              tags: value
                .split(/[,\n\uFF0C]/)
                .map((item) => toText(item))
                .filter(Boolean),
            };
          default:
            return {
              ...record,
              [field]: value,
            };
        }
      });
      dispatch({
        type: "BATCH_UPDATE",
        updates: {
          memoryPreferenceRecordsDraft: nextRecords,
          memoryPreferenceDirty: true,
          memoryPreferenceError: "",
          memoryPreferenceSaveSummary: null,
        },
      });
    },
    [dispatch, state.memoryPreferenceRecordsDraft, state.memoryPreferenceSelectedRecordId],
  );

  const handlePreferenceNewRecord = useCallback(() => {
    const draft = createMemoryPreferenceDraftRecord({
      category: "general",
      importance: 5,
      confidence: 0.9,
      tags: [],
      status: "active",
      scopeType: state.memoryPreferenceActiveScopeType,
      scopeKey: state.memoryPreferenceActiveScopeKey,
    } as Partial<MemoryScopeDraftRecord>);
    const nextRecords = [draft, ...state.memoryPreferenceRecordsDraft];
    dispatch({
      type: "BATCH_UPDATE",
      updates: {
        memoryPreferenceMode: "records",
        memoryPreferenceRecordsDraft: nextRecords,
        memoryPreferenceSelectedRecordId: draft.clientId,
        memoryPreferenceDirty: true,
        memoryPreferenceError: "",
        memoryPreferenceSaveSummary: null,
      },
    });
  }, [
    dispatch,
    state.memoryPreferenceActiveScopeKey,
    state.memoryPreferenceActiveScopeType,
    state.memoryPreferenceRecordsDraft,
  ]);

  const handlePreferenceDeleteRecord = useCallback(
    (id: string) => {
      const nextRecords = state.memoryPreferenceRecordsDraft.filter(
        (record) => record.clientId !== id,
      );
      const nextSelectedId =
        state.memoryPreferenceSelectedRecordId === id
          ? nextRecords[0]?.clientId || ""
          : state.memoryPreferenceSelectedRecordId;
      dispatch({
        type: "BATCH_UPDATE",
        updates: {
          memoryPreferenceRecordsDraft: nextRecords,
          memoryPreferenceSelectedRecordId: nextSelectedId,
          memoryPreferenceDirty: true,
          memoryPreferenceError: "",
          memoryPreferenceSaveSummary: null,
        },
      });
    },
    [
      dispatch,
      state.memoryPreferenceRecordsDraft,
      state.memoryPreferenceSelectedRecordId,
    ],
  );

  const handlePreferenceValidate = useCallback(async () => {
    if (!agentContext.agentKey) return;
    if (state.memoryPreferenceMode !== "markdown") return;
    const syncedMarkdownDraft =
      preferenceMarkdownTextareaRef.current?.value ??
      state.memoryPreferenceMarkdownDraft;
    if (syncedMarkdownDraft !== state.memoryPreferenceMarkdownDraft) {
      dispatch({
        type: "SET_MEMORY_PREFERENCE_MARKDOWN_DRAFT",
        markdown: syncedMarkdownDraft,
      });
    }
    dispatch({
      type: "BATCH_UPDATE",
      updates: {
        memoryPreferenceLoading: true,
        memoryPreferenceError: "",
      },
    });
    try {
      const response = await validateMemoryScope(
        agentContext.agentKey,
        state.memoryPreferenceActiveScopeType,
        syncedMarkdownDraft,
      );
      dispatch({
        type: "BATCH_UPDATE",
        updates: {
          memoryPreferenceValidation: response.data,
          memoryPreferenceLoading: false,
          memoryPreferenceError: "",
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      dispatch({
        type: "BATCH_UPDATE",
        updates: {
          memoryPreferenceLoading: false,
          memoryPreferenceError: t("memoryPreferences.errors.validate", {
            detail: message,
          }),
        },
      });
    }
  }, [
    agentContext.agentKey,
    dispatch,
    state.memoryPreferenceActiveScopeType,
    state.memoryPreferenceMarkdownDraft,
    state.memoryPreferenceMode,
    t,
  ]);

  const handlePreferenceSave = useCallback(async () => {
    if (!agentContext.agentKey) return;
    const syncedRecordsDraft =
      state.memoryPreferenceMode === "records"
        ? syncSelectedPreferenceDraftFromLiveValues(
            state.memoryPreferenceRecordsDraft,
            state.memoryPreferenceSelectedRecordId,
            {
              title: preferenceTitleInputRef.current?.value,
              summary: preferenceSummaryTextareaRef.current?.value,
              category: preferenceCategoryInputRef.current?.value,
              importance: preferenceImportanceInputRef.current?.value,
              confidence: preferenceConfidenceInputRef.current?.value,
              tags: preferenceTagsInputRef.current?.value,
            },
          )
        : state.memoryPreferenceRecordsDraft;
    const syncedMarkdownDraft =
      preferenceMarkdownTextareaRef.current?.value ??
      state.memoryPreferenceMarkdownDraft;
    const syncUpdates: Record<string, unknown> = {};
    if (
      state.memoryPreferenceMode === "records" &&
      syncedRecordsDraft !== state.memoryPreferenceRecordsDraft
    ) {
      syncUpdates.memoryPreferenceRecordsDraft = syncedRecordsDraft;
    }
    if (
      state.memoryPreferenceMode === "markdown" &&
      syncedMarkdownDraft !== state.memoryPreferenceMarkdownDraft
    ) {
      syncUpdates.memoryPreferenceMarkdownDraft = syncedMarkdownDraft;
    }
    dispatch({
      type: "BATCH_UPDATE",
      updates: {
        ...syncUpdates,
        memoryPreferenceSaving: true,
        memoryPreferenceError: "",
        memoryPreferenceSaveSummary: null,
      },
    });

    try {
      if (state.memoryPreferenceMode === "markdown") {
        const validationResponse = await validateMemoryScope(
          agentContext.agentKey,
          state.memoryPreferenceActiveScopeType,
          syncedMarkdownDraft,
        );
        dispatch({
          type: "SET_MEMORY_PREFERENCE_VALIDATION",
          validation: validationResponse.data,
        });
        if (!validationResponse.data.valid) {
          dispatch({
            type: "BATCH_UPDATE",
            updates: {
              memoryPreferenceSaving: false,
              memoryPreferenceError: "",
            },
          });
          return;
        }
      }

      const response = await saveMemoryScope({
        agentKey: agentContext.agentKey,
        scopeType: state.memoryPreferenceActiveScopeType,
        scopeKey: state.memoryPreferenceActiveScopeKey || undefined,
        mode: state.memoryPreferenceMode,
        archiveMissing: true,
        ...(state.memoryPreferenceMode === "markdown"
          ? { markdown: syncedMarkdownDraft }
          : {
              records: toScopeRecordInputs(syncedRecordsDraft),
            }),
      });

      dispatch({
        type: "BATCH_UPDATE",
        updates: {
          memoryPreferenceSaving: false,
          memoryPreferenceSaveSummary: response.data.summary,
          memoryPreferenceValidation: null,
        },
      });
      await loadPreferenceScope(
        normalizePreferenceScopeType(response.data.scopeType),
        response.data.scopeKey,
        { preserveSaveSummary: true, preserveValidation: false },
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      dispatch({
        type: "BATCH_UPDATE",
        updates: {
          memoryPreferenceSaving: false,
          memoryPreferenceError: t("memoryPreferences.errors.save", {
            detail: message,
          }),
        },
      });
    }
  }, [
    agentContext.agentKey,
    dispatch,
    loadPreferenceScope,
    state.memoryPreferenceActiveScopeKey,
    state.memoryPreferenceActiveScopeType,
    state.memoryPreferenceMarkdownDraft,
    state.memoryPreferenceMode,
    state.memoryPreferenceRecordsDraft,
    state.memoryPreferenceSelectedRecordId,
    t,
  ]);

  useEffect(() => {
    if (open) {
      return;
    }
    listRequestSeqRef.current += 1;
    detailRequestSeqRef.current += 1;
    preferenceScopesSeqRef.current += 1;
    preferenceScopeSeqRef.current += 1;
    metaLoadAttemptedRef.current = false;
    previewAutoTriggeredRef.current = false;
    preferencesLoadSignatureRef.current = "";
  }, [open]);

  useEffect(() => {
    if (!open) {
      return;
    }
    void loadMemoryMeta();
  }, [loadMemoryMeta, open]);

  useEffect(() => {
    if (!open || !agentContext.agentKey) {
      return;
    }
    if (state.memoryConsoleTab !== "preferences") {
      return;
    }
    const signature = `${agentContext.agentKey}:preferences`;
    if (preferencesLoadSignatureRef.current === signature) {
      return;
    }
    preferencesLoadSignatureRef.current = signature;
    void loadPreferenceScopes();
  }, [
    agentContext.agentKey,
    loadPreferenceScopes,
    state.memoryConsoleTab,
    open,
  ]);

  useEffect(() => {
    if (!open || state.memoryConsoleTab !== "preview") {
      return;
    }
    if (state.memoryPreviewDraft || !state.composerDraft) {
      return;
    }
    dispatch({
      type: "SET_MEMORY_PREVIEW_DRAFT",
      draft: state.composerDraft,
    });
  }, [
    dispatch,
    state.composerDraft,
    state.memoryConsoleTab,
    open,
    state.memoryPreviewDraft,
  ]);

  useEffect(() => {
    if (!open || state.memoryConsoleTab !== "preview") {
      return;
    }
    if (previewAutoTriggeredRef.current) {
      return;
    }
    if (
      !toText(previewChatId) ||
      !toText(state.memoryPreviewDraft) ||
      toText(state.memoryPreviewDraft) !== toText(state.composerDraft)
    ) {
      return;
    }
    previewAutoTriggeredRef.current = true;
    void runMemoryPreview(state.memoryPreviewDraft);
  }, [
    state.composerDraft,
    previewChatId,
    runMemoryPreview,
    state.memoryConsoleTab,
    open,
    state.memoryPreviewDraft,
  ]);

  const subtitle = agentContext.agentKey
    ? t("memoryInfo.subtitle", {
        label: agentContext.label || agentContext.agentKey,
      })
    : t("memoryInfo.subtitleEmpty");

  const consoleProps: MemoryInfoConsoleViewProps = {
    title: t("memoryInfo.title"),
    subtitle,
    activeTab: state.memoryConsoleTab,
    onTabChange: (tab) => dispatch({ type: "SET_MEMORY_CONSOLE_TAB", tab }),
    recordsPanel: {
      agentKey: agentContext.agentKey,
      loading: state.memoryInfoLoading,
      error: state.memoryInfoError,
      memoryMeta: state.memoryMeta,
      records: state.memoryInfoRecords,
      selectedRecordId: state.memoryInfoSelectedRecordId,
      detail: state.memoryInfoDetail,
      detailLoading: state.memoryInfoDetailLoading,
      detailError: state.memoryInfoDetailError,
      filters: state.memoryInfoFilters,
      missingAgent: false,
      onQuery: () => {
        void loadRecords();
      },
      onRefresh: () => {
        void loadRecords();
      },
      onSelectRecord: (id) => {
        dispatch({ type: "SET_MEMORY_INFO_SELECTED_RECORD_ID", id });
        const record = state.memoryInfoRecords.find((item) => item.id === id);
        void loadDetail(
          id,
          record?.agentKey || agentContext.agentKey || undefined,
        );
      },
      onFilterChange: updateFilter,
    },
    preferencesPanel: {
      agentKey: agentContext.agentKey,
      missingAgent: !agentContext.agentKey,
      scopes: state.memoryPreferenceScopes,
      activeScopeType: state.memoryPreferenceActiveScopeType,
      activeScopeKey: state.memoryPreferenceActiveScopeKey,
      label: state.memoryPreferenceLabel,
      fileName: state.memoryPreferenceFileName,
      meta: state.memoryPreferenceMeta,
      memoryMeta: state.memoryMeta,
      loading: state.memoryPreferenceLoading,
      error: state.memoryPreferenceError,
      mode: state.memoryPreferenceMode,
      markdownDraft: state.memoryPreferenceMarkdownDraft,
      recordsDraft: state.memoryPreferenceRecordsDraft,
      selectedRecordId: state.memoryPreferenceSelectedRecordId,
      dirty: state.memoryPreferenceDirty,
      saving: state.memoryPreferenceSaving,
      saveSummary: state.memoryPreferenceSaveSummary,
      validation: state.memoryPreferenceValidation,
      editorRefs: {
        title: preferenceTitleInputRef,
        summary: preferenceSummaryTextareaRef,
        category: preferenceCategoryInputRef,
        importance: preferenceImportanceInputRef,
        confidence: preferenceConfidenceInputRef,
        tags: preferenceTagsInputRef,
        markdown: preferenceMarkdownTextareaRef,
      },
      onScopeSelect: handlePreferenceScopeSelect,
      onModeChange: handlePreferenceModeChange,
      onMarkdownChange: handlePreferenceMarkdownChange,
      onRecordFieldChange: handlePreferenceRecordFieldChange,
      onSelectRecord: (id) =>
        dispatch({ type: "SET_MEMORY_PREFERENCE_SELECTED_RECORD_ID", id }),
      onNewRecord: handlePreferenceNewRecord,
      onDeleteRecord: handlePreferenceDeleteRecord,
      onValidate: () => {
        void handlePreferenceValidate();
      },
      onSave: () => {
        void handlePreferenceSave();
      },
    },
    previewPanel: {
      agentKey: agentContext.agentKey,
      chatId: previewChatId,
      teamId: previewTeamId,
      draft: state.memoryPreviewDraft,
      loading: state.memoryPreviewLoading,
      error: state.memoryPreviewError,
      result: state.memoryPreviewResult,
      promptLayer: state.memoryPreviewPromptLayer,
      onDraftChange: (draft) =>
        dispatch({ type: "SET_MEMORY_PREVIEW_DRAFT", draft }),
      onPromptLayerChange: (layer) =>
        dispatch({ type: "SET_MEMORY_PREVIEW_PROMPT_LAYER", layer }),
      onPreview: () => {
        void runMemoryPreview();
      },
    },
  };

  if (!open) {
    return null;
  }

  if (surface === "modal") {
    return (
      <MemoryInfoModalView
        {...consoleProps}
        open={open}
        onClose={closeModal}
      />
    );
  }

  return (
    <MemoryInfoConsoleView
      {...consoleProps}
      cardClassName="memory-info-page-card"
    />
  );
};

export const MemoryInfoModal: React.FC<{
  open?: boolean;
  onClose?: () => void;
}> = ({ open = true, onClose }) => {
  return (
    <MemoryInfoConsole
      open={open}
      surface="modal"
      onClose={onClose}
    />
  );
};
