import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent, Dispatch } from "react";
import type { AppAction } from "@/app/state/AppContext";
import type { AppState } from "@/app/state/types";
import {
  type ComposerAttachment,
  createPendingComposerAttachments,
  revokeAttachmentPreviewUrl,
  uploadComposerAttachments,
} from "@/features/composer/lib/composerAttachments";

interface UseComposerAttachmentsInput {
  dispatch: Dispatch<AppAction>;
  isFrontendActive: boolean;
  isVoiceMode: boolean;
  state: Pick<
    AppState,
    | "chatId"
    | "chatAgentById"
    | "pendingNewChatAgentKey"
    | "streaming"
    | "workerIndexByKey"
    | "workerSelectionKey"
  >;
}

export interface ComposerAttachmentScrollState {
  canScrollLeft: boolean;
  canScrollRight: boolean;
}

export function useComposerAttachments(input: UseComposerAttachmentsInput) {
  const { dispatch, isFrontendActive, isVoiceMode, state } = input;
  const fileInputRef = useRef<HTMLInputElement>(null);
  const attachmentViewportRef = useRef<HTMLDivElement>(null);
  const attachmentsRef = useRef<ComposerAttachment[]>([]);
  const [attachments, setAttachments] = useState<ComposerAttachment[]>([]);
  const [attachmentChatId, setAttachmentChatId] = useState("");
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
  const useUnifiedComposerAttachmentRow = attachments.length > 1;
  const hasComposerAttachmentOverflow =
    attachmentScrollState.canScrollLeft || attachmentScrollState.canScrollRight;

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
    (event: ChangeEvent<HTMLInputElement>) => {
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
      state.chatAgentById,
      state.chatId,
      state.pendingNewChatAgentKey,
      state.workerIndexByKey,
      state.workerSelectionKey,
    ],
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
    attachmentChatId,
    attachmentScrollState,
    attachmentViewportRef,
    attachments,
    clearComposerAttachments,
    fileInputRef,
    handleFileSelection,
    handleRemoveAttachment,
    hasComposerAttachmentOverflow,
    hasUploadingAttachments,
    openFilePicker,
    readyAttachments,
    scrollComposerAttachments,
    sendAttachmentMeta,
    sendReferences,
    setAttachments,
    useUnifiedComposerAttachmentRow,
  };
}
