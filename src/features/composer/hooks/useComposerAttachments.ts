import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent, ClipboardEvent, Dispatch, DragEvent } from "react";
import type { AppAction } from "@/app/state/AppContext";
import type { AppState } from "@/app/state/AppContext";
import {
  canUseDesktopScreenshotBridge,
  captureDesktopScreenshot as captureDesktopScreenshotFromBridge,
  desktopScreenshotToFile,
} from "@/shared/data/desktop/desktopScreenshot";
import { normalizeTimelineAttachments } from "@/features/events/lib/timelineAttachments";
import { t } from "@/shared/i18n";
import {
  type ComposerAttachment,
  type ComposerContextReferenceInput,
  createComposerContextAttachment,
  createPendingComposerAttachments,
  getComposerAttachmentNameKey,
  keepLatestFilesByName,
  revokeAttachmentPreviewUrl,
  uploadComposerAttachments,
} from "@/features/composer/lib/composerAttachments";

interface UseComposerAttachmentsInput {
  dispatch: Dispatch<AppAction>;
  isFrontendActive: boolean;
  isVoiceMode: boolean;
  mainChatRunning: boolean;
  state: Pick<
    AppState,
    | "chatId"
    | "chatAgentById"
    | "pendingNewChatAgentKey"
    | "workerIndexByKey"
    | "workerSelectionKey"
  > & Partial<Pick<AppState, "restoredSteerReferencesByChatId">>;
  onError?: (message: string) => void;
}

export interface ComposerAttachmentScrollState {
  canScrollLeft: boolean;
  canScrollRight: boolean;
}

function addTimestampToFilename(filename: string) {
  // 找到最后一个 . 的位置（分割文件名和后缀）
  const dotIndex = filename.lastIndexOf(".");
  if (dotIndex === -1) return filename; // 无后缀直接返回

  const name = filename.slice(0, dotIndex);
  const ext = filename.slice(dotIndex);
  const timestamp = Date.now(); // 13位时间戳

  return `${name}_${timestamp}${ext}`;
}

export function useComposerAttachments(input: UseComposerAttachmentsInput) {
  const {
    dispatch,
    isFrontendActive,
    isVoiceMode,
    mainChatRunning,
    onError,
    state,
  } = input;
  const fileInputRef = useRef<HTMLInputElement>(null);
  const attachmentViewportRef = useRef<HTMLDivElement>(null);
  const attachmentsRef = useRef<ComposerAttachment[]>([]);
  const latestAttachmentIdByNameRef = useRef(new Map<string, string>());
  const stagedFilesByAttachmentIdRef = useRef(new Map<string, File>());
  const [localAttachments, setAttachments] = useState<ComposerAttachment[]>([]);
  const restoredReferences = state.restoredSteerReferencesByChatId?.[state.chatId];
  const restoredAttachments = useMemo<ComposerAttachment[]>(
    () => (restoredReferences || []).flatMap((reference, index) => {
      const [item] = normalizeTimelineAttachments([reference]);
      return item ? [{
        id: `restored-steer:${index}`,
        name: item.name,
        size: item.size || 0,
        type: item.type,
        mimeType: item.mimeType,
        resourceUrl: item.url,
        status: "ready" as const,
        error: "",
        references: [reference],
      }] : [];
    }),
    [restoredReferences],
  );
  const attachments = useMemo(
    () => [...localAttachments, ...restoredAttachments],
    [localAttachments, restoredAttachments],
  );
  const hasFailedAttachments = attachments.some(attachment => attachment.status === "error");
  const [attachmentChatId, setAttachmentChatId] = useState("");
  const [isCapturingDesktopScreenshot, setIsCapturingDesktopScreenshot] =
    useState(false);
  const [attachmentScrollState, setAttachmentScrollState] =
    useState<ComposerAttachmentScrollState>({
      canScrollLeft: false,
      canScrollRight: false,
    });

  const readyAttachments = useMemo(
    () => attachments.filter((attachment) => attachment.status === "ready"),
    [attachments],
  );
  const hasUploadingAttachments = useMemo(
    () => attachments.some((attachment) => attachment.status === "uploading"),
    [attachments],
  );
  const hasStagedAttachments = useMemo(
    () => attachments.some((attachment) => attachment.status === "staged"),
    [attachments],
  );
  const sendReferences = useMemo(
    () => readyAttachments.flatMap((attachment) => attachment.references),
    [readyAttachments],
  );
  const sendAttachmentMeta = useMemo(
    () =>
      readyAttachments.map((attachment) => {
        const primaryReference =
          attachment.references[0] &&
          typeof attachment.references[0] === "object" &&
          !Array.isArray(attachment.references[0])
            ? (attachment.references[0] as Record<string, unknown>)
            : null;
        return {
          ...(typeof primaryReference?.id === "string"
            ? { id: primaryReference.id }
            : {}),
          name: attachment.name,
          size: attachment.size,
          type: attachment.type,
          mimeType: attachment.mimeType,
          url: attachment.resourceUrl,
          ...(primaryReference?.meta &&
          typeof primaryReference.meta === "object" &&
          !Array.isArray(primaryReference.meta)
            ? {
                meta: {
                  ...(primaryReference.meta as Record<string, unknown>),
                },
              }
            : {}),
        };
      }),
    [readyAttachments],
  );
  const useUnifiedComposerAttachmentRow = attachments.length > 1;
  const hasComposerAttachmentOverflow =
    attachmentScrollState.canScrollLeft || attachmentScrollState.canScrollRight;
  const canCaptureDesktopScreenshot = useMemo(
    () => canUseDesktopScreenshotBridge(),
    [],
  );

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
    if (restoredReferences?.length) {
      dispatch({ type: "SET_RESTORED_STEER_REFERENCES", chatId: state.chatId, references: [] });
    }
    attachmentsRef.current.forEach((attachment) => {
      revokeAttachmentPreviewUrl(attachment.previewUrl);
    });
    latestAttachmentIdByNameRef.current.clear();
    stagedFilesByAttachmentIdRef.current.clear();
    setAttachments([]);
    setAttachmentChatId("");
    setAttachmentScrollState({
      canScrollLeft: false,
      canScrollRight: false,
    });
  }, [dispatch, state.chatId, restoredReferences]);

  const openFilePicker = useCallback(() => {
    if (isFrontendActive || isVoiceMode) {
      return;
    }
    fileInputRef.current?.click();
  }, [isFrontendActive, isVoiceMode]);

  const addContextReference = useCallback(
    (reference: ComposerContextReferenceInput) => {
      if (mainChatRunning || isFrontendActive || isVoiceMode) {
        return false;
      }
      const nextAttachment = createComposerContextAttachment(reference);
      if (
        !nextAttachment.id ||
        !nextAttachment.name ||
        !String(reference.id || "").trim()
      ) {
        return false;
      }
      setAttachments((current) => [
        ...current.filter((attachment) => attachment.id !== nextAttachment.id),
        nextAttachment,
      ]);
      return true;
    },
    [isFrontendActive, isVoiceMode, mainChatRunning],
  );

  const handleRemoveAttachment = useCallback(
    (attachmentId: string) => {
      if (attachmentId.startsWith("restored-steer:")) {
        const index = Number(attachmentId.slice("restored-steer:".length));
        dispatch({ type: "SET_RESTORED_STEER_REFERENCES", chatId: state.chatId, references: (restoredReferences || []).filter((_, i) => i !== index) });
        return;
      }
      setAttachments((current) => {
        const removedAttachment = current.find(
          (attachment) => attachment.id === attachmentId,
        );
        if (removedAttachment) {
          stagedFilesByAttachmentIdRef.current.delete(removedAttachment.id);
          revokeAttachmentPreviewUrl(removedAttachment.previewUrl);
          const nameKey = getComposerAttachmentNameKey(removedAttachment);
          if (
            latestAttachmentIdByNameRef.current.get(nameKey) ===
            removedAttachment.id
          ) {
            latestAttachmentIdByNameRef.current.delete(nameKey);
          }
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
    [state.chatId, dispatch, restoredReferences],
  );

  const uploadFiles = useCallback(
    (files: File[]) => {
      if (files.length === 0 || isFrontendActive || isVoiceMode) {
        return false;
      }

      const latestFiles = keepLatestFilesByName(files);
      if (latestFiles.length === 0) {
        return false;
      }

      const nextAttachments = createPendingComposerAttachments(latestFiles);
      const replacementNames = new Set(
        nextAttachments.map(getComposerAttachmentNameKey),
      );
      nextAttachments.forEach((attachment) => {
        latestAttachmentIdByNameRef.current.set(
          getComposerAttachmentNameKey(attachment),
          attachment.id,
        );
      });

      setAttachments((current) => {
        const retainedAttachments = current.filter((attachment) => {
          const shouldReplace = replacementNames.has(
            getComposerAttachmentNameKey(attachment),
          );
          if (shouldReplace) {
            revokeAttachmentPreviewUrl(attachment.previewUrl);
          }
          return !shouldReplace;
        });
        return [...retainedAttachments, ...nextAttachments];
      });

      void (async () => {
        await uploadComposerAttachments({
          files: latestFiles,
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
          isLatestAttachment: (attachment) =>
            latestAttachmentIdByNameRef.current.get(
              getComposerAttachmentNameKey(attachment),
            ) === attachment.id,
        });
      })();

      return true;
    },
    [
      attachmentChatId,
      dispatch,
      isFrontendActive,
      isVoiceMode,
      state.chatAgentById,
      state.chatId,
      state.pendingNewChatAgentKey,
      state.workerIndexByKey,
      state.workerSelectionKey,
    ],
  );

  const captureDesktopScreenshot = useCallback(async () => {
    if (!canCaptureDesktopScreenshot) {
      onError?.(t("composer.actions.screenshotUnavailable"));
      return false;
    }
    if (
      isCapturingDesktopScreenshot ||
      mainChatRunning ||
      isFrontendActive ||
      isVoiceMode
    ) {
      return false;
    }

    setIsCapturingDesktopScreenshot(true);
    try {
      const screenshot = await captureDesktopScreenshotFromBridge();
      if (!screenshot) {
        return false;
      }
      return uploadFiles([desktopScreenshotToFile(screenshot)]);
    } catch (error) {
      onError?.((error as Error).message || t("composer.actions.screenshotFailed"));
      return false;
    } finally {
      setIsCapturingDesktopScreenshot(false);
    }
  }, [
    canCaptureDesktopScreenshot,
    isCapturingDesktopScreenshot,
    isFrontendActive,
    isVoiceMode,
    mainChatRunning,
    onError,
    uploadFiles,
  ]);

  const stageReviewAttachment = useCallback(
    (file: File) => {
      if (
        !file ||
        file.type !== "image/png" ||
        file.size <= 0 ||
        file.size > 12 * 1024 * 1024 ||
        mainChatRunning ||
        isFrontendActive ||
        isVoiceMode
      ) {
        return false;
      }
      const [pending] = createPendingComposerAttachments([file]);
      if (!pending) return false;
      const staged: ComposerAttachment = { ...pending, status: "staged" };
      const nameKey = getComposerAttachmentNameKey(staged);
      latestAttachmentIdByNameRef.current.set(nameKey, staged.id);
      stagedFilesByAttachmentIdRef.current.set(staged.id, file);
      setAttachments((current) => {
        const retained = current.filter((attachment) => {
          if (getComposerAttachmentNameKey(attachment) !== nameKey) return true;
          revokeAttachmentPreviewUrl(attachment.previewUrl);
          stagedFilesByAttachmentIdRef.current.delete(attachment.id);
          return false;
        });
        stagedFilesByAttachmentIdRef.current.set(staged.id, file);
        return [...retained, staged];
      });
      return true;
    },
    [isFrontendActive, isVoiceMode, mainChatRunning],
  );

  const uploadStagedAttachments = useCallback(async () => {
    const staged = attachmentsRef.current.filter(
      (attachment) => attachment.status === "staged",
    );
    if (staged.length === 0) return true;
    const files = staged.map((attachment) =>
      stagedFilesByAttachmentIdRef.current.get(attachment.id),
    );
    if (files.some((file) => !file)) return false;
    setAttachments((current) => current.map((attachment) =>
      staged.some((candidate) => candidate.id === attachment.id)
        ? { ...attachment, status: "uploading", error: "" }
        : attachment,
    ));
    const succeeded = await uploadComposerAttachments({
      files: files as File[],
      nextAttachments: staged.map((attachment) => ({ ...attachment, status: "uploading" })),
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
      isLatestAttachment: (attachment) =>
        latestAttachmentIdByNameRef.current.get(
          getComposerAttachmentNameKey(attachment),
        ) === attachment.id,
    });
    if (succeeded) {
      staged.forEach((attachment) => {
        stagedFilesByAttachmentIdRef.current.delete(attachment.id);
      });
    } else {
      setAttachments((current) => current.map((attachment) =>
        staged.some((candidate) => candidate.id === attachment.id) &&
        attachment.status === "error"
          ? { ...attachment, status: "staged" }
          : attachment,
      ));
    }
    return succeeded;
  }, [
    attachmentChatId,
    dispatch,
    state.chatAgentById,
    state.chatId,
    state.pendingNewChatAgentKey,
    state.workerIndexByKey,
    state.workerSelectionKey,
  ]);

  const handleFileSelection = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(event.target.files || []);
      event.target.value = "";
      uploadFiles(files);
    },
    [uploadFiles],
  );

  const handleFilePaste = useCallback(
    (event: ClipboardEvent<HTMLElement>) => {
      const files = Array.from(event.clipboardData?.files || [])?.map(
        (file) =>
          new File([file], addTimestampToFilename(file.name), {
            type: file.type,
          }),
      );
      if (files.length === 0) {
        return;
      }
      event.preventDefault();
      uploadFiles(files);
    },
    [uploadFiles],
  );

  const handleFileDragOver = useCallback((event: DragEvent<HTMLElement>) => {
    if (Array.from(event.dataTransfer?.types || []).includes("Files")) {
      event.preventDefault();
    }
  }, []);

  const handleFileDrop = useCallback(
    (event: DragEvent<HTMLElement>) => {
      const files = Array.from(event.dataTransfer?.files || []);
      if (files.length === 0) {
        return;
      }

      event.preventDefault();
      uploadFiles(files);
    },
    [uploadFiles],
  );

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
      stagedFilesByAttachmentIdRef.current.clear();
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
    if (String(state.chatId || "").trim()) {
      setAttachmentChatId("");
    }
  }, [state.chatId]);

  return {
    addContextReference,
    attachmentChatId,
    attachmentScrollState,
    attachmentViewportRef,
    attachments,
    canCaptureDesktopScreenshot,
    captureDesktopScreenshot,
    clearComposerAttachments,
    fileInputRef,
    handleFileDragOver,
    handleFileDrop,
    handleFileSelection,
    handleFilePaste,
    handleRemoveAttachment,
    hasComposerAttachmentOverflow,
    hasStagedAttachments,
    hasUploadingAttachments,
    hasFailedAttachments,
    isCapturingDesktopScreenshot,
    openFilePicker,
    readyAttachments,
    stageReviewAttachment,
    scrollComposerAttachments,
    sendAttachmentMeta,
    sendReferences,
    setAttachments,
    useUnifiedComposerAttachmentRow,
    uploadStagedAttachments,
  };
}
