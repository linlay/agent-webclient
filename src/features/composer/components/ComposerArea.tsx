import React, {
  useRef,
  useCallback,
  useState,
  useEffect,
  useMemo,
} from "react";
import { useAppState, useAppDispatch } from "@/app/state/AppContext";
import type {
  AIAwaitSubmitPayloadData,
  FormActiveAwaiting,
} from "@/app/state/types";
import { MentionSuggest } from "@/features/composer/components/MentionSuggest";
import { SlashPalette } from "@/features/composer/components/SlashPalette";
import { SteerBar } from "@/features/composer/components/SteerBar";
import { ControlsForm } from "@/features/composer/components/ControlsForm";
import {
  ComposerProvider,
  type ComposerContextValue,
} from "@/features/composer/components/ComposerContext";
import { ComposerAttachments } from "@/features/composer/components/ComposerAttachments";
import { ComposerInput } from "@/features/composer/components/ComposerInput";
import { ComposerActions } from "@/features/composer/components/ComposerActions";
import { ComposerWonders } from "@/features/composer/components/ComposerWonders";
import { createRequestId } from "@/shared/api/apiClient";
import {
  getAgent,
  interruptChat,
  learnChat,
  rememberChat,
  steerChat,
  submitAwaiting,
} from "@/features/transport/lib/apiClientProxy";
import { parseLeadingMentionDraft } from "@/features/composer/lib/mentionParser";
import { resolveMentionCandidatesFromState } from "@/features/composer/lib/mentionCandidates";
import { resolveCurrentWorkerSummary } from "@/features/workers/lib/currentWorker";
import { isImeEnterConfirming } from "@/shared/utils/ime";
import {
  resolvePreferredAgentKey,
  resolvePreferredTeamId,
} from "@/features/composer/lib/queryRouting";
import {
  getFilteredSlashCommands,
  getLatestQueryText,
} from "@/features/composer/lib/slashCommands";
import {
  normalizeWonders,
  pickRandomWonders,
} from "@/features/composer/lib/wonders";
import {
  type ComposerAttachment,
  createPendingComposerAttachments,
  getComposerAttachmentSubtitle,
  revokeAttachmentPreviewUrl,
  uploadComposerAttachments,
} from "@/features/composer/lib/composerAttachments";
import { useSlashCommandExecution } from "@/features/composer/hooks/useSlashCommandExecution";
import { AttachmentCard } from "@/features/artifacts/components/AttachmentCard";
import { MaterialIcon } from "@/shared/ui/MaterialIcon";
import { UiButton } from "@/shared/ui/UiButton";
import { useSpeechInput } from "@/features/composer/components/useSpeechInput";
import { Input } from "antd";
import { TextAreaRef } from "antd/es/input/TextArea";
import { Buildin } from "@/features/tools/components/buildin";
import { message } from "antd";
import { AwaitingHtmlContainer } from "@/features/tools/components/AwaitingHtmlContainer";
import { buildTimelineDisplayItems } from "@/features/timeline/lib/timelineDisplay";
import { useI18n } from "@/shared/i18n";

type FormActiveAwaitingPatch = Pick<
  FormActiveAwaiting,
  "loading" | "loadError" | "viewportHtml"
>;

type FormActiveAwaitingPatchPayload = Partial<FormActiveAwaitingPatch> & {
  resolvedByOther?: boolean;
};

export const ComposerArea: React.FC = () => {
  const state = useAppState();
  const dispatch = useAppDispatch();
  const { t } = useI18n();
  const composerRef = useRef<HTMLDivElement>(null);
  const composerPillRef = useRef<HTMLDivElement>(null);
  const slashPaletteRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<TextAreaRef>(null);
  const attachmentViewportRef = useRef<HTMLDivElement>(null);
  const blankWonderSignatureRef = useRef("");
  const isComposingRef = useRef(false);
  const pendingSendRef = useRef(false);
  const pendingSentMessageRef = useRef("");
  const wasBlankConversationRef = useRef(false);
  const attachmentsRef = useRef<ComposerAttachment[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [attachments, setAttachments] = useState<ComposerAttachment[]>([]);
  const [attachmentChatId, setAttachmentChatId] = useState("");
  const [agentWonderCache, setAgentWonderCache] = useState<
    Record<string, string[]>
  >({});
  const [slashDismissed, setSlashDismissed] = useState(false);
  const [activeSlashIndex, setActiveSlashIndex] = useState(0);
  const [sampledWonders, setSampledWonders] = useState<string[]>([]);
  const [steerSubmitting, setSteerSubmitting] = useState(false);
  const [controlParams, setControlParams] = useState<Record<string, unknown>>(
    {},
  );
  const [slashPopoverWidth, setSlashPopoverWidth] = useState<number>();
  const [attachmentScrollState, setAttachmentScrollState] = useState({
    canScrollLeft: false,
    canScrollRight: false,
  });

  const isFrontendActive = !!state.activeFrontendTool;
  const activeAwaiting = state.activeAwaiting;
  const isAwaitingActive = !!activeAwaiting;
  const hasPendingSteers = state.pendingSteers.length > 0;
  const hasSteerDraft = Boolean(state.steerDraft.trim());
  const shouldShowSteerBar =
    state.streaming &&
    !isFrontendActive &&
    !isAwaitingActive &&
    (hasSteerDraft || hasPendingSteers);
  const timelineEntries = useMemo(() => {
    return state.timelineOrder
      .map((id) => state.timelineNodes.get(id))
      .filter((node): node is NonNullable<typeof node> => Boolean(node));
  }, [state.timelineOrder, state.timelineNodes]);
  const latestQueryText = useMemo(
    () => getLatestQueryText(timelineEntries),
    [timelineEntries],
  );
  const slashCommands = useMemo(
    () => getFilteredSlashCommands(inputValue),
    [inputValue],
  );
  const currentWorker = useMemo(
    () => resolveCurrentWorkerSummary(state),
    [state],
  );
  const currentAgentKey = useMemo(() => {
    if (currentWorker?.type !== "agent") {
      return "";
    }
    return String(currentWorker.sourceId || "").trim();
  }, [currentWorker]);
  const currentAgentWonders = useMemo(() => {
    if (!currentAgentKey) {
      return [];
    }
    const agent = state.agents.find(
      (item) => String(item?.key || "").trim() === currentAgentKey,
    );
    const fromState = normalizeWonders(agent?.wonders);
    if (fromState.length > 0) {
      return fromState;
    }
    return agentWonderCache[currentAgentKey] || [];
  }, [agentWonderCache, currentAgentKey, state.agents]);
  const voiceModeAvailable = currentWorker?.type === "agent";
  const isVoiceMode = state.inputMode === "voice";
  const readyAttachments = useMemo(
    () => attachments.filter((attachment) => attachment.status === "ready"),
    [attachments],
  );
  const hasUploadingAttachments = useMemo(
    () => attachments.some((attachment) => attachment.status === "uploading"),
    [attachments],
  );
  const useUnifiedComposerAttachmentRow = attachments.length > 1;
  const hasComposerAttachmentOverflow =
    attachmentScrollState.canScrollLeft || attachmentScrollState.canScrollRight;
  const sendReferences = useMemo(
    () => readyAttachments.flatMap((attachment) => attachment.references),
    [readyAttachments],
  );
  const sendAttachmentMeta = useMemo(
    () =>
      readyAttachments.map((attachment) => ({
        name: attachment.name,
        size: attachment.size,
        type: attachment.type,
        mimeType: attachment.mimeType,
        url: attachment.resourceUrl,
      })),
    [readyAttachments],
  );
  const hasVoiceUserPreview = Boolean(state.voiceChat.partialUserText.trim());
  const hasVoiceAssistantPreview = Boolean(
    state.voiceChat.partialAssistantText.trim(),
  );
  const showSlashPalette =
    !isVoiceMode &&
    !isFrontendActive &&
    !isAwaitingActive &&
    !state.commandModal.open &&
    !slashDismissed &&
    slashCommands.length > 0;
  const sendDisabled =
    isFrontendActive ||
    isAwaitingActive ||
    hasUploadingAttachments ||
    (!inputValue.trim() && sendReferences.length === 0);

  const updateComposerAttachmentScrollState = useCallback(() => {
    const viewport = attachmentViewportRef.current;
    if (!viewport) {
      setAttachmentScrollState({
        canScrollLeft: false,
        canScrollRight: false,
      });
      return;
    }

    const maxScrollLeft = Math.max(
      viewport.scrollWidth - viewport.clientWidth,
      0,
    );
    setAttachmentScrollState({
      canScrollLeft: viewport.scrollLeft > 4,
      canScrollRight:
        maxScrollLeft > 4 && viewport.scrollLeft < maxScrollLeft - 4,
    });
  }, []);
  const scrollComposerAttachments = useCallback(
    (direction: "left" | "right") => {
      const viewport = attachmentViewportRef.current;
      if (!viewport) {
        return;
      }

      const distance = Math.max(viewport.clientWidth * 0.72, 220);
      viewport.scrollBy({
        left: direction === "left" ? -distance : distance,
        behavior: "smooth",
      });
    },
    [],
  );
  const clearComposerAttachments = useCallback(() => {
    attachmentsRef.current.forEach((attachment) => {
      revokeAttachmentPreviewUrl(attachment.previewUrl);
    });
    setAttachments([]);
    setAttachmentChatId("");
    setAttachmentScrollState({
      canScrollLeft: false,
      canScrollRight: false,
    });
  }, []);

  useEffect(() => {
    attachmentsRef.current = attachments;
  }, [attachments]);

  useEffect(() => {
    updateComposerAttachmentScrollState();
  }, [attachments, updateComposerAttachmentScrollState]);

  useEffect(() => {
    const viewport = attachmentViewportRef.current;
    if (!viewport) {
      return;
    }

    const handleScroll = () => {
      updateComposerAttachmentScrollState();
    };

    handleScroll();
    viewport.addEventListener("scroll", handleScroll, {
      passive: true,
    });
    window.addEventListener("resize", handleScroll);

    let resizeObserver: ResizeObserver | null = null;
    if (typeof ResizeObserver !== "undefined") {
      resizeObserver = new ResizeObserver(() => {
        updateComposerAttachmentScrollState();
      });
      resizeObserver.observe(viewport);
      const content = viewport.firstElementChild;
      if (content instanceof Element) {
        resizeObserver.observe(content);
      }
    }

    return () => {
      viewport.removeEventListener("scroll", handleScroll);
      window.removeEventListener("resize", handleScroll);
      resizeObserver?.disconnect();
    };
  }, [attachments.length, updateComposerAttachmentScrollState]);

  useEffect(
    () => () => {
      attachmentsRef.current.forEach((attachment) => {
        revokeAttachmentPreviewUrl(attachment.previewUrl);
      });
    },
    [],
  );

  useEffect(() => {
    const handleClearComposerAttachments = () => {
      clearComposerAttachments();
    };

    window.addEventListener(
      "agent:clear-composer-attachments",
      handleClearComposerAttachments,
    );
    return () => {
      window.removeEventListener(
        "agent:clear-composer-attachments",
        handleClearComposerAttachments,
      );
    };
  }, [clearComposerAttachments]);

  useEffect(() => {
    textareaRef.current?.focus();
    if (String(state.chatId || "").trim()) {
      setAttachmentChatId("");
    }
  }, [state.chatId]);

  useEffect(() => {
    const anchor = composerPillRef.current;
    if (!anchor) return;

    const updateSlashPopoverWidth = () => {
      const nextWidth = anchor.offsetWidth;
      setSlashPopoverWidth(nextWidth > 0 ? nextWidth : undefined);
    };
    updateSlashPopoverWidth();

    if (typeof ResizeObserver !== "undefined") {
      const observer = new ResizeObserver(() => {
        updateSlashPopoverWidth();
      });
      observer.observe(anchor);
      return () => {
        observer.disconnect();
      };
    }

    window.addEventListener("resize", updateSlashPopoverWidth);
    return () => {
      window.removeEventListener("resize", updateSlashPopoverWidth);
    };
  }, []);

  useEffect(() => {
    if (!showSlashPalette) return;

    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (
        !composerRef.current?.contains(target) &&
        !slashPaletteRef.current?.contains(target)
      ) {
        setSlashDismissed(true);
      }
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setSlashDismissed(true);
    };

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [showSlashPalette]);

  const closeMention = useCallback(() => {
    dispatch({ type: "SET_MENTION_OPEN", open: false });
    dispatch({ type: "SET_MENTION_SUGGESTIONS", agents: [] });
    dispatch({ type: "SET_MENTION_ACTIVE_INDEX", index: 0 });
  }, [dispatch]);

  useEffect(() => {
    if (!isVoiceMode) return;
    closeMention();
    setSlashDismissed(true);
  }, [closeMention, isVoiceMode]);

  const updateMentionSuggestions = useCallback(
    (value: string) => {
      const draft = parseLeadingMentionDraft(value);
      if (!draft) {
        closeMention();
        return;
      }

      const query = String(draft.token || "").toLowerCase();
      const candidates = resolveMentionCandidatesFromState(state)
        .filter((agent) => {
          const key = String(agent.key || "").toLowerCase();
          const name = String(agent.name || "").toLowerCase();
          if (!query) return true;
          return key.includes(query) || name.includes(query);
        })
        .slice(0, 8);

      if (candidates.length === 0) {
        closeMention();
        return;
      }

      dispatch({ type: "SET_MENTION_SUGGESTIONS", agents: candidates });
      dispatch({ type: "SET_MENTION_ACTIVE_INDEX", index: 0 });
      dispatch({ type: "SET_MENTION_OPEN", open: true });
    },
    [closeMention, dispatch, state],
  );

  const toggleVoiceMode = useCallback(() => {
    if (!voiceModeAvailable || state.streaming || isFrontendActive) {
      return;
    }
    dispatch({
      type: "SET_INPUT_MODE",
      mode: isVoiceMode ? "text" : "voice",
    });
  }, [
    dispatch,
    isFrontendActive,
    isVoiceMode,
    state.streaming,
    voiceModeAvailable,
  ]);
  const {
    speechSupported,
    speechListening,
    speechState,
    speechStatus,
    toggleSpeechInput,
    stopSpeechInput,
  } = useSpeechInput({
    inputValue,
    setInputValue,
    setSlashDismissed,
    updateMentionSuggestions,
  });
  const openFilePicker = useCallback(() => {
    if (state.streaming || isFrontendActive || isVoiceMode) {
      return;
    }
    fileInputRef.current?.click();
  }, [isFrontendActive, isVoiceMode, state.streaming]);

  const handleRemoveAttachment = useCallback(
    (attachmentId: string) => {
      setAttachments((current) => {
        const removedAttachment = current.find(
          (attachment) => attachment.id === attachmentId,
        );
        if (removedAttachment) {
          revokeAttachmentPreviewUrl(removedAttachment.previewUrl);
        }
        const next = current.filter(
          (attachment) => attachment.id !== attachmentId,
        );
        if (next.length === 0 && !String(state.chatId || "").trim()) {
          setAttachmentChatId("");
        }
        return next;
      });
    },
    [state.chatId],
  );

  const handleFileSelection = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(event.target.files || []);
      event.target.value = "";
      if (files.length === 0) {
        return;
      }

      const nextAttachments = createPendingComposerAttachments(files);

      setAttachments((current) => [...current, ...nextAttachments]);

      void (async () => {
        await uploadComposerAttachments({
          files,
          nextAttachments,
          attachmentChatId,
          state: {
            chatId: state.chatId,
            chatAgentById: state.chatAgentById,
            pendingNewChatAgentKey: state.pendingNewChatAgentKey,
            workerSelectionKey: state.workerSelectionKey,
            workerIndexByKey: state.workerIndexByKey,
          },
          dispatch,
          setAttachments,
          setAttachmentChatId,
        });
      })();
    },
    [
      attachmentChatId,
      dispatch,
      state.chatId,
      state.chatAgentById,
      state.pendingNewChatAgentKey,
      state.workerSelectionKey,
      state.workerIndexByKey,
    ],
  );
  const showSpeechHint =
    !isVoiceMode &&
    (!speechSupported || speechState === "error" || speechState === "unsupported");
  const slashAvailability = useMemo(
    () => ({
      streaming: state.streaming,
      hasLatestQuery: Boolean(latestQueryText),
      isFrontendActive,
      canUseVoiceMode: Boolean(voiceModeAvailable),
      hasActiveChat: Boolean(String(state.chatId || "").trim()),
      hasCurrentWorker: Boolean(currentWorker),
      workerHistoryCount: currentWorker?.relatedChats.length || 0,
      workerCount: state.workerRows.length,
      commandModalOpen: state.commandModal.open,
    }),
    [
      currentWorker,
      state.streaming,
      state.chatId,
      state.commandModal.open,
      state.workerRows.length,
      latestQueryText,
      isFrontendActive,
      voiceModeAvailable,
    ],
  );

  const selectMentionByIndex = useCallback(
    (index: number) => {
      const target = state.mentionSuggestions[index];
      if (!target) return;
      const displayLabel = String(target.name || "").trim() || target.key;
      const next = `@${displayLabel} `;
      setInputValue(next);
      setSlashDismissed(false);
      closeMention();
      window.requestAnimationFrame(() => {
        const el = textareaRef.current?.resizableTextArea?.textArea;
        if (!el) return;
        el.focus();
        const caret = next.length;
        el.setSelectionRange(caret, caret);
      });
    },
    [closeMention, state.mentionSuggestions],
  );

  useEffect(() => {
    if (!showSlashPalette) {
      setActiveSlashIndex(0);
      return;
    }
    if (activeSlashIndex >= slashCommands.length) {
      setActiveSlashIndex(0);
    }
  }, [activeSlashIndex, showSlashPalette, slashCommands.length]);

  useEffect(() => {
    const message = inputValue.trim();
    if (!message) {
      pendingSendRef.current = false;
      pendingSentMessageRef.current = "";
      return;
    }
    if (message !== pendingSentMessageRef.current) {
      pendingSendRef.current = false;
    }
  }, [inputValue]);

  const appendTextBlock = useCallback((base: string, extra: string) => {
    const nextExtra = String(extra || "");
    if (!nextExtra.trim()) return base;
    if (!base.trim()) return nextExtra;
    return `${base}${base.endsWith("\n") ? "" : "\n"}${nextExtra}`;
  }, []);

  const resolveCurrentRunId = useCallback(() => {
    const fromState = String(state.runId || "").trim();
    if (fromState) return fromState;

    for (let i = state.events.length - 1; i >= 0; i -= 1) {
      const event = state.events[i];
      const rid = String((event as { runId?: string }).runId || "").trim();
      if (rid) return rid;
    }
    return "";
  }, [state.runId, state.events]);

  const resolveCurrentAgentKey = useCallback(() => {
    return resolvePreferredAgentKey({
      chatId: state.chatId,
      chatAgentById: state.chatAgentById,
      pendingNewChatAgentKey: state.pendingNewChatAgentKey,
      workerSelectionKey: state.workerSelectionKey,
      workerIndexByKey: state.workerIndexByKey,
    });
  }, [
    state.chatId,
    state.chatAgentById,
    state.pendingNewChatAgentKey,
    state.workerSelectionKey,
    state.workerIndexByKey,
  ]);

  const resolveCurrentTeamId = useCallback(() => {
    return resolvePreferredTeamId({
      chatId: state.chatId,
      chatAgentById: state.chatAgentById,
      pendingNewChatAgentKey: state.pendingNewChatAgentKey,
      workerSelectionKey: state.workerSelectionKey,
      workerIndexByKey: state.workerIndexByKey,
    });
  }, [
    state.chatId,
    state.chatAgentById,
    state.pendingNewChatAgentKey,
    state.workerSelectionKey,
    state.workerIndexByKey,
  ]);

  const resetForNewConversation = useCallback(() => {
    clearComposerAttachments();
    window.dispatchEvent(
      new CustomEvent("agent:start-new-conversation", {
        detail: { focusComposerOnComplete: true },
      }),
    );
  }, [clearComposerAttachments]);

  const interruptCurrentRun = useCallback(async () => {
    const chatId = String(state.chatId || "").trim();
    const runId = resolveCurrentRunId();
    const requestId = createRequestId("req");
    const agentKey = resolveCurrentAgentKey();
    const teamId = resolveCurrentTeamId();
    if (!chatId || !runId) {
      dispatch({
        type: "APPEND_DEBUG",
        line: `[interrupt] skipped: missing chatId/runId (chatId=${chatId || "-"}, runId=${runId || "-"})`,
      });
      return;
    }

    try {
      await interruptChat({
        requestId,
        chatId,
        runId,
        agentKey: agentKey || undefined,
        teamId: teamId || undefined,
        message: "",
        planningMode: Boolean(state.planningMode),
      });
      dispatch({
        type: "APPEND_DEBUG",
        line: `[interrupt] requested for chatId=${chatId}, runId=${runId}, requestId=${requestId}`,
      });
    } catch (error) {
      dispatch({
        type: "APPEND_DEBUG",
        line: `[interrupt] failed: ${(error as Error).message}`,
      });
    } finally {
      state.abortController?.abort();
      window.dispatchEvent(
        new CustomEvent("agent:voice-stop-all", {
          detail: { reason: "interrupt", mode: "stop" },
        }),
      );
      dispatch({ type: "SET_STREAMING", streaming: false });
      dispatch({ type: "SET_ABORT_CONTROLLER", controller: null });
    }
  }, [
    dispatch,
    resolveCurrentRunId,
    resolveCurrentAgentKey,
    resolveCurrentTeamId,
    state.chatId,
    state.abortController,
    state.planningMode,
  ]);

  const scheduleCommandStatusOverlayHide = useCallback(() => {
    const timer = window.setTimeout(() => {
      dispatch({ type: "HIDE_COMMAND_STATUS_OVERLAY" });
    }, 2000);
    dispatch({
      type: "SET_COMMAND_STATUS_OVERLAY_TIMER",
      timer,
    });
  }, [dispatch]);

  const triggerCommandStatusOverlay = useCallback(
    (
      commandType: "remember" | "learn",
      phase: "pending" | "success" | "error",
      text: string,
    ) => {
      dispatch({
        type: "SHOW_COMMAND_STATUS_OVERLAY",
        commandType,
        phase,
        text,
      });
    },
    [dispatch],
  );

  const submitBackgroundCommand = useCallback(
    async (commandType: "remember" | "learn") => {
      const chatId = String(state.chatId || "").trim();
      if (!chatId) {
        return;
      }

      const requestId = createRequestId(commandType);
      const pendingText =
        commandType === "remember"
          ? t("composer.background.remember.pending")
          : t("composer.background.learn.pending");
      const errorText =
        commandType === "remember"
          ? t("composer.background.remember.error")
          : t("composer.background.learn.error");

      triggerCommandStatusOverlay(commandType, "pending", pendingText);

      try {
        const request = commandType === "remember" ? rememberChat : learnChat;
        await request({
          requestId,
          chatId,
        });
        dispatch({
          type: "APPEND_DEBUG",
          line: `[${commandType}] submitted for chatId=${chatId}, requestId=${requestId}`,
        });
        triggerCommandStatusOverlay(commandType, "success", pendingText);
      } catch (error) {
        dispatch({
          type: "APPEND_DEBUG",
          line: `[${commandType}] failed: ${(error as Error).message}`,
        });
        triggerCommandStatusOverlay(commandType, "error", errorText);
      } finally {
        scheduleCommandStatusOverlayHide();
      }
    },
    [
      dispatch,
      scheduleCommandStatusOverlayHide,
      state.chatId,
      triggerCommandStatusOverlay,
    ],
  );

  const executeSlashCommand = useSlashCommandExecution({
    slashAvailability,
    closeMention,
    latestQueryText,
    resetForNewConversation,
    dispatch,
    toggleVoiceMode,
    interruptCurrentRun,
    submitRememberCommand: () => submitBackgroundCommand("remember"),
    submitLearnCommand: () => submitBackgroundCommand("learn"),
    setInputValue,
    setSlashDismissed,
    state: {
      desktopDebugSidebarEnabled: state.desktopDebugSidebarEnabled,
      planningMode: state.planningMode,
    },
  });

  const resetEventCache = useCallback(() => {
    window.dispatchEvent(new CustomEvent("agent:reset-event-cache"));
  }, []);

  const clearActiveAwaiting = useCallback(() => {
    dispatch({ type: "CLEAR_ACTIVE_AWAITING" });
    resetEventCache();
  }, [dispatch, resetEventCache]);

  const handleAwaitingSubmit = useCallback(
    async (payload: AIAwaitSubmitPayloadData) => {
      if (!activeAwaiting) return;
      try {
        const response = await submitAwaiting({
          runId: payload.runId,
          awaitingId: payload.awaitingId,
          params: payload.params,
        });
        const responseData = response.data as Record<string, unknown> | null;
        const accepted = Boolean(responseData?.accepted ?? true);
        const status = String(responseData?.status || "");
        const detail = String(
          responseData?.detail || (accepted ? "accepted" : "unmatched"),
        );

        if (!accepted) {
          if (status === "already_resolved") {
            void message.info(t("composer.awaiting.alreadyResolved"));
            clearActiveAwaiting();
            return response;
          }
          throw new Error(
            t("composer.awaiting.unmatched", {
              detail,
            }),
          );
        }

        clearActiveAwaiting();
        dispatch({
          type: "APPEND_DEBUG",
          line: `[awaiting] submitted awaitingId=${activeAwaiting.awaitingId}, runId=${activeAwaiting.runId}, detail=${detail}`,
        });
      } catch (error) {
        const isStaleAwaiting =
          error instanceof Error &&
          /unknown awaiting|awaiting.*not found|awaiting.*expired/i.test(
            error.message,
          );
        if (isStaleAwaiting) {
          void message.warning(t("composer.awaiting.expired"));
          clearActiveAwaiting();
          dispatch({ type: "SET_STREAMING", streaming: false });
          dispatch({ type: "SET_ABORT_CONTROLLER", controller: null });
          return;
        }
        return error;
      }
    },
    [activeAwaiting, clearActiveAwaiting, dispatch],
  );

  const handlePatchActiveAwaiting = useCallback(
    (patch: FormActiveAwaitingPatchPayload) => {
      dispatch({ type: "PATCH_ACTIVE_AWAITING", patch });
    },
    [dispatch],
  );

  const handleSend = useCallback(() => {
    if (isAwaitingActive) return;
    if (isVoiceMode) return;
    if (speechListening) {
      stopSpeechInput();
    }
    if (showSlashPalette) {
      const selected = slashCommands[activeSlashIndex] || slashCommands[0];
      if (selected) {
        void executeSlashCommand(selected.id);
      }
      return;
    }

    const message = inputValue.trim();
    if (!message && sendReferences.length === 0) return;
    if (hasUploadingAttachments) return;
    if (pendingSendRef.current && pendingSentMessageRef.current === message) {
      return;
    }
    if (state.streaming) {
      if (sendReferences.length > 0) {
        dispatch({
          type: "APPEND_DEBUG",
          line: "[upload] attachments are not supported while steering an active run",
        });
        return;
      }
      dispatch({ type: "SET_STEER_DRAFT", draft: message });
      setInputValue("");
      setSlashDismissed(false);
      closeMention();
      return;
    }
    pendingSendRef.current = true;
    pendingSentMessageRef.current = message;
    const pendingChatId = String(state.chatId || attachmentChatId || "").trim();
    const agentKey = resolvePreferredAgentKey({
      chatId: pendingChatId,
      chatAgentById: state.chatAgentById,
      pendingNewChatAgentKey: state.pendingNewChatAgentKey,
      workerSelectionKey: state.workerSelectionKey,
      workerIndexByKey: state.workerIndexByKey,
    });
    const teamId = resolvePreferredTeamId({
      chatId: pendingChatId,
      chatAgentById: state.chatAgentById,
      pendingNewChatAgentKey: state.pendingNewChatAgentKey,
      workerSelectionKey: state.workerSelectionKey,
      workerIndexByKey: state.workerIndexByKey,
    });
    if (pendingChatId && !String(state.chatId || "").trim() && !agentKey) {
      pendingSendRef.current = false;
      pendingSentMessageRef.current = "";
      dispatch({
        type: "APPEND_DEBUG",
        line: `[send] skipped: missing agentKey for pending uploaded chat (chatId=${pendingChatId})`,
      });
      return;
    }
    setInputValue("");
    attachments.forEach((attachment) => {
      revokeAttachmentPreviewUrl(attachment.previewUrl);
    });
    setAttachments([]);
    setAttachmentChatId("");
    setSlashDismissed(false);
    closeMention();
    window.dispatchEvent(
      new CustomEvent("agent:send-message", {
        detail: {
          message,
          chatId: pendingChatId || undefined,
          agentKey: agentKey || undefined,
          teamId: teamId || undefined,
          references: sendReferences,
          attachments: sendAttachmentMeta,
          params: controlParams,
        },
      }),
    );
  }, [
    activeSlashIndex,
    attachments,
    closeMention,
    dispatch,
    executeSlashCommand,
    hasUploadingAttachments,
    inputValue,
    isAwaitingActive,
    isVoiceMode,
    attachmentChatId,
    controlParams,
    state.chatId,
    state.chatAgentById,
    state.pendingNewChatAgentKey,
    state.workerSelectionKey,
    state.workerIndexByKey,
    sendAttachmentMeta,
    sendReferences,
    showSlashPalette,
    slashCommands,
    speechListening,
    state.streaming,
    stopSpeechInput,
  ]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (isVoiceMode) {
        e.preventDefault();
        return;
      }
      if (isImeEnterConfirming(e, isComposingRef.current)) {
        return;
      }

      if (showSlashPalette) {
        if (e.key === "ArrowDown") {
          e.preventDefault();
          setActiveSlashIndex(
            (current) => (current + 1) % slashCommands.length,
          );
          return;
        }
        if (e.key === "ArrowUp") {
          e.preventDefault();
          setActiveSlashIndex(
            (current) =>
              (current - 1 + slashCommands.length) % slashCommands.length,
          );
          return;
        }
        if (e.key === "Escape") {
          e.preventDefault();
          setSlashDismissed(true);
          return;
        }
        if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault();
          const selected = slashCommands[activeSlashIndex] || slashCommands[0];
          if (selected) {
            void executeSlashCommand(selected.id);
          }
          return;
        }
      }

      if (state.mentionOpen && state.mentionSuggestions.length > 0) {
        if (e.key === "ArrowDown") {
          e.preventDefault();
          dispatch({
            type: "SET_MENTION_ACTIVE_INDEX",
            index:
              (state.mentionActiveIndex + 1) % state.mentionSuggestions.length,
          });
          return;
        }
        if (e.key === "ArrowUp") {
          e.preventDefault();
          dispatch({
            type: "SET_MENTION_ACTIVE_INDEX",
            index:
              (state.mentionActiveIndex - 1 + state.mentionSuggestions.length) %
              state.mentionSuggestions.length,
          });
          return;
        }
        if (e.key === "Escape") {
          e.preventDefault();
          closeMention();
          return;
        }
        if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault();
          selectMentionByIndex(state.mentionActiveIndex);
          return;
        }
      }

      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [
      activeSlashIndex,
      closeMention,
      dispatch,
      executeSlashCommand,
      handleSend,
      isVoiceMode,
      isComposingRef,
      selectMentionByIndex,
      showSlashPalette,
      slashCommands,
      state.mentionActiveIndex,
      state.mentionOpen,
      state.mentionSuggestions,
    ],
  );

  const handleSteer = useCallback(async () => {
    const message = state.steerDraft.trim();
    if (!message || !state.streaming || steerSubmitting) return;

    const chatId = String(state.chatId || "").trim();
    const runId = resolveCurrentRunId();
    const requestId = createRequestId("req");
    const steerId =
      typeof globalThis.crypto?.randomUUID === "function"
        ? globalThis.crypto.randomUUID()
        : createRequestId("steer");
    const agentKey = resolveCurrentAgentKey();
    const teamId = resolveCurrentTeamId();
    if (!chatId || !runId) {
      dispatch({
        type: "APPEND_DEBUG",
        line: `[steer] skipped: missing chatId/runId (chatId=${chatId || "-"}, runId=${runId || "-"})`,
      });
      return;
    }

    setSteerSubmitting(true);
    try {
      await steerChat({
        requestId,
        chatId,
        runId,
        steerId,
        agentKey: agentKey || undefined,
        teamId: teamId || undefined,
        message,
        planningMode: Boolean(state.planningMode),
      });
      dispatch({
        type: "APPEND_DEBUG",
        line: `[steer] submitted for chatId=${chatId}, runId=${runId}, requestId=${requestId}`,
      });
      dispatch({
        type: "ENQUEUE_PENDING_STEER",
        steer: {
          steerId,
          message,
          requestId,
          runId,
          createdAt: Date.now(),
        },
      });
      dispatch({ type: "SET_STEER_DRAFT", draft: "" });
    } catch (error) {
      dispatch({
        type: "APPEND_DEBUG",
        line: `[steer] failed: ${(error as Error).message}`,
      });
    } finally {
      setSteerSubmitting(false);
    }
  }, [
    state.steerDraft,
    state.streaming,
    state.chatId,
    resolveCurrentRunId,
    resolveCurrentAgentKey,
    resolveCurrentTeamId,
    dispatch,
    state.planningMode,
    steerSubmitting,
  ]);

  const handleCancelSteer = useCallback(() => {
    const draft = String(state.steerDraft || "");
    dispatch({ type: "SET_STEER_DRAFT", draft: "" });
    setInputValue(draft);
    setSlashDismissed(false);
    updateMentionSuggestions(draft);
    window.requestAnimationFrame(() => {
      const el = textareaRef.current?.resizableTextArea?.textArea;
      if (!el) return;
      el.focus();
      const caret = draft.length;
      el.setSelectionRange(caret, caret);
    });
  }, [dispatch, state.steerDraft, updateMentionSuggestions]);

  useEffect(() => {
    const onFocusComposer = () => {
      window.requestAnimationFrame(() => {
        const el = textareaRef.current?.resizableTextArea?.textArea;
        if (!el) return;
        el.focus();
        const caret = el.value.length;
        el.setSelectionRange(caret, caret);
      });
    };

    window.addEventListener("agent:focus-composer", onFocusComposer);
    return () =>
      window.removeEventListener("agent:focus-composer", onFocusComposer);
  }, []);

  const applyComposerDraft = useCallback(
    (draft: string) => {
      setInputValue(draft);
      setSlashDismissed(false);
      if (draft.startsWith("/")) {
        closeMention();
      } else {
        updateMentionSuggestions(draft);
      }
      window.requestAnimationFrame(() => {
        const el = textareaRef.current?.resizableTextArea?.textArea;
        if (!el) return;
        el.focus();
        const caret = draft.length;
        el.setSelectionRange(caret, caret);
      });
    },
    [closeMention, updateMentionSuggestions],
  );

  useEffect(() => {
    const onSetDraft = (event: Event) => {
      const draft = String((event as CustomEvent).detail?.draft || "");
      applyComposerDraft(draft);
    };

    window.addEventListener("agent:set-composer-draft", onSetDraft);
    return () =>
      window.removeEventListener("agent:set-composer-draft", onSetDraft);
  }, [applyComposerDraft]);

  useEffect(() => {
    const onSelectMention = (event: Event) => {
      const agentKey = String(
        (event as CustomEvent).detail?.agentKey || "",
      ).trim();
      const agentName = String(
        (event as CustomEvent).detail?.agentName || "",
      ).trim();
      if (!agentKey) return;
      const displayLabel = agentName || agentKey;
      setInputValue(`@${displayLabel} `);
      setSlashDismissed(false);
      closeMention();
    };

    window.addEventListener("agent:select-mention", onSelectMention);
    return () =>
      window.removeEventListener("agent:select-mention", onSelectMention);
  }, [closeMention]);

  useEffect(() => {
    if (!isVoiceMode && !isFrontendActive) return;
    stopSpeechInput();
  }, [isFrontendActive, isVoiceMode, stopSpeechInput]);

  useEffect(() => {
    if (state.streaming || steerSubmitting) return;

    let nextValue = inputValue;
    let changed = false;

    const draft = String(state.steerDraft || "");
    if (draft.trim()) {
      nextValue = appendTextBlock(nextValue, draft);
      changed = true;
    }

    const pendingText = state.pendingSteers
      .map((steer) => String(steer.message || "").trim())
      .filter(Boolean)
      .join("\n");
    if (pendingText) {
      nextValue = appendTextBlock(nextValue, pendingText);
      changed = true;
    }

    if (!changed) return;

    setInputValue(nextValue);
    setSlashDismissed(false);
    updateMentionSuggestions(nextValue);
    if (draft.trim()) {
      dispatch({ type: "SET_STEER_DRAFT", draft: "" });
    }
    if (state.pendingSteers.length > 0) {
      dispatch({ type: "CLEAR_PENDING_STEERS" });
    }
    window.requestAnimationFrame(() => {
      const el = textareaRef.current?.resizableTextArea?.textArea;
      if (!el) return;
      el.focus();
      const caret = nextValue.length;
      el.setSelectionRange(caret, caret);
    });
  }, [
    appendTextBlock,
    dispatch,
    inputValue,
    state.pendingSteers,
    state.steerDraft,
    state.streaming,
    steerSubmitting,
    updateMentionSuggestions,
  ]);

  const composerContextValue = useMemo<ComposerContextValue>(
    () => ({
      inputValue,
      setInputValue,
      activeSlashIndex,
      setActiveSlashIndex,
      slashDismissed,
      setSlashDismissed,
      attachmentScrollState,
      openFilePicker,
      handleSend,
      interruptCurrentRun,
      executeSlashCommand: async (commandId) => {
        await executeSlashCommand(commandId);
      },
      toggleSpeechInput,
      applyComposerDraft,
    }),
    [
      inputValue,
      activeSlashIndex,
      slashDismissed,
      attachmentScrollState,
      openFilePicker,
      handleSend,
      interruptCurrentRun,
      executeSlashCommand,
      toggleSpeechInput,
      applyComposerDraft,
    ],
  );

  const isTimelineEmpty = useMemo(() => {
    return (
      buildTimelineDisplayItems(timelineEntries, state.events).length === 0
    );
  }, [timelineEntries, state.events]);
  const isBlankConversation =
    isTimelineEmpty && !String(state.chatId || "").trim();

  useEffect(() => {
    if (!currentAgentKey) {
      return;
    }
    if (
      Object.prototype.hasOwnProperty.call(agentWonderCache, currentAgentKey)
    ) {
      return;
    }

    let cancelled = false;
    void getAgent(currentAgentKey)
      .then((response) => {
        if (cancelled) {
          return;
        }
        const payload = (response.data || {}) as { wonders?: unknown };
        const wonders = normalizeWonders(payload.wonders);
        setAgentWonderCache((current) => {
          if (Object.prototype.hasOwnProperty.call(current, currentAgentKey)) {
            return current;
          }
          return {
            ...current,
            [currentAgentKey]: wonders,
          };
        });
      })
      .catch(() => {
        if (cancelled) {
          return;
        }
        setAgentWonderCache((current) => {
          if (Object.prototype.hasOwnProperty.call(current, currentAgentKey)) {
            return current;
          }
          return {
            ...current,
            [currentAgentKey]: [],
          };
        });
      });

    return () => {
      cancelled = true;
    };
  }, [agentWonderCache, currentAgentKey]);

  useEffect(() => {
    const signature = currentAgentKey
      ? `${currentAgentKey}\u0000${currentAgentWonders.join("\u0001")}`
      : "";
    const shouldShowWonders =
      isBlankConversation && signature !== "" && currentAgentWonders.length > 0;

    if (!shouldShowWonders) {
      if (sampledWonders.length > 0) {
        setSampledWonders([]);
      }
      blankWonderSignatureRef.current = "";
      wasBlankConversationRef.current = false;
      return;
    }

    if (
      !wasBlankConversationRef.current ||
      blankWonderSignatureRef.current !== signature
    ) {
      setSampledWonders(pickRandomWonders(currentAgentWonders, 3));
      blankWonderSignatureRef.current = signature;
    }
    wasBlankConversationRef.current = true;
  }, [
    currentAgentKey,
    currentAgentWonders,
    isBlankConversation,
    sampledWonders.length,
  ]);

  return isAwaitingActive && activeAwaiting ? (
    activeAwaiting.mode === "form" ? (
      <AwaitingHtmlContainer
        data={activeAwaiting}
        onPatch={handlePatchActiveAwaiting}
        onSubmit={handleAwaitingSubmit}
        onClose={clearActiveAwaiting}
        onResolvedByOther={clearActiveAwaiting}
      />
    ) : activeAwaiting.mode === "approval" ? (
      <Buildin.ApprovalDialog
        data={activeAwaiting}
        onSubmit={handleAwaitingSubmit}
        onResolvedByOther={clearActiveAwaiting}
      />
    ) : activeAwaiting.mode === "question" ? (
      <Buildin.QuestionDialog
        data={activeAwaiting}
        onSubmit={handleAwaitingSubmit}
        onResolvedByOther={clearActiveAwaiting}
      />
    ) : null
  ) : (
    <ComposerProvider value={composerContextValue}>
      <div
        ref={composerRef}
        className={`composer-area ${isFrontendActive ? "is-frontend-active" : ""}`}
      >
        <input
          ref={fileInputRef}
          className="composer-file-input"
          type="file"
          multiple
          tabIndex={-1}
          hidden
          onChange={handleFileSelection}
        />
        {state.mentionOpen && <MentionSuggest />}
        {shouldShowSteerBar && (
          <SteerBar
            pendingSteers={state.pendingSteers}
            steerDraft={state.steerDraft}
            steerSubmitting={steerSubmitting}
            onSubmit={() => void handleSteer()}
            onCancel={handleCancelSteer}
          />
        )}
        <div
          className={`composer-layout ${isFrontendActive ? "is-frontend-active" : ""}`}
        >
          <SlashPalette
            open={showSlashPalette}
            slashPaletteRef={slashPaletteRef}
            slashCommands={slashCommands}
            activeSlashIndex={activeSlashIndex}
            slashAvailability={slashAvailability}
            planningMode={state.planningMode}
            slashPopoverWidth={slashPopoverWidth}
            getPopupContainer={() => composerRef.current ?? document.body}
            onSelect={(commandId) => void executeSlashCommand(commandId)}
          >
            <div className="composer-stack">
              <div
                ref={composerPillRef}
                className={`composer-pill ${isFrontendActive ? "hidden" : ""} ${isVoiceMode ? "is-voice-mode" : ""}`}
              >
                <ComposerAttachments
                  attachments={attachments}
                  attachmentViewportRef={attachmentViewportRef}
                  useUnifiedComposerAttachmentRow={useUnifiedComposerAttachmentRow}
                  hasComposerAttachmentOverflow={hasComposerAttachmentOverflow}
                  attachmentScrollState={attachmentScrollState}
                  onRemoveAttachment={handleRemoveAttachment}
                  onScroll={scrollComposerAttachments}
                />
                <ComposerInput
                  isVoiceMode={isVoiceMode}
                  isFrontendActive={isFrontendActive}
                  isTimelineEmpty={isTimelineEmpty}
                  inputValue={inputValue}
                  currentWorkerName={
                    state.voiceChat.currentAgentName ||
                    currentWorker?.displayName ||
                    ""
                  }
                  voiceStatus={state.voiceChat.status}
                  voiceError={state.voiceChat.error}
                  partialUserText={state.voiceChat.partialUserText}
                  partialAssistantText={state.voiceChat.partialAssistantText}
                  onInputChange={(next) => {
                    setInputValue(next);
                    setSlashDismissed(false);
                    if (slashCommands.length > 0 || next.startsWith("/")) {
                      closeMention();
                    }
                    if (!next.startsWith("/")) {
                      updateMentionSuggestions(next);
                    }
                  }}
                  onKeyDown={handleKeyDown}
                  onCompositionStart={() => {
                    isComposingRef.current = true;
                  }}
                  onCompositionEnd={() => {
                    isComposingRef.current = false;
                  }}
                  textareaRef={textareaRef}
                />
                <ComposerActions
                  isFrontendActive={isFrontendActive}
                  isVoiceMode={isVoiceMode}
                  isStreaming={state.streaming}
                  planningMode={state.planningMode}
                  hasUploadingAttachments={hasUploadingAttachments}
                  speechListening={speechListening}
                  speechSupported={speechSupported}
                  speechStatus={speechStatus}
                  sendDisabled={sendDisabled}
                  onControlParamsChange={setControlParams}
                  onTogglePlanningMode={() =>
                    dispatch({
                      type: "SET_PLANNING_MODE",
                      enabled: !state.planningMode,
                    })
                  }
                />
                {showSpeechHint && <div className="voice-hint">{speechStatus}</div>}
              </div>
              {isBlankConversation && sampledWonders.length > 0 && (
                <ComposerWonders sampledWonders={sampledWonders} />
              )}
            </div>
          </SlashPalette>
        </div>
      </div>
    </ComposerProvider>
  );
};
