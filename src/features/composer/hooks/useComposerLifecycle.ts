import { useEffect } from "react";
import type { Dispatch, RefObject, SetStateAction } from "react";
import type { TextAreaRef } from "antd/es/input/TextArea";
import {
  AGENT_WEBCLIENT_COMPOSER_DRAFT_ACTION,
  AGENT_WEBCLIENT_COMPOSER_DRAFT_VERSION,
  AGENT_WEBCLIENT_WORKPANEL_PREVIEW_REVIEW_PAGE_EVENT,
  type AgentWebclientComposerDraftAction,
} from "@/shared/contracts/generated/agentWebclientBridge";
import { DESKTOP_COMPOSER_REVIEW_DRAFT_EVENT } from "@/shared/data/desktop/desktopContextMenu";

function emitComposerDraftResult(requestId: string, ok: boolean, code?: string) {
  window.dispatchEvent(new CustomEvent(AGENT_WEBCLIENT_WORKPANEL_PREVIEW_REVIEW_PAGE_EVENT, {
    detail: {
      event: "composer-draft-result",
      version: AGENT_WEBCLIENT_COMPOSER_DRAFT_VERSION,
      requestId,
      ok,
      ...(code ? { code } : {}),
    },
  }));
}

function readStagedPng(action: AgentWebclientComposerDraftAction) {
  const attachment = action.attachment;
  if (!attachment) return null;
  if (
    attachment.mimeType !== "image/png" ||
    !attachment.name ||
    attachment.sizeBytes <= 0 ||
    attachment.sizeBytes > 12 * 1024 * 1024 ||
    typeof attachment.dataBase64 !== "string"
  ) return false;
  try {
    const binary = window.atob(attachment.dataBase64);
    if (binary.length !== attachment.sizeBytes) return false;
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }
    return new File([bytes], attachment.name.slice(0, 240), { type: "image/png" });
  } catch {
    return false;
  }
}

export function appendDesktopReviewDraft(current: string, draft: string) {
  return current.trim() ? `${current}\n\n---\n\n${draft}` : draft;
}

export function useComposerLifecycle({
  applyComposerDraft,
  chatId,
  closeMention,
  isFrontendActive,
  isVoiceMode,
  setInputValue,
  stageReviewAttachment,
  setSlashDismissed,
  stopSpeechInput,
  textareaRef,
}: {
  applyComposerDraft: (draft: string) => void;
  chatId: string;
  closeMention: () => void;
  isFrontendActive: boolean;
  isVoiceMode: boolean;
  setInputValue: Dispatch<SetStateAction<string>>;
  stageReviewAttachment: (file: File) => boolean;
  setSlashDismissed: Dispatch<SetStateAction<boolean>>;
  stopSpeechInput: () => void;
  textareaRef: RefObject<TextAreaRef>;
}) {
  useEffect(() => {
    const onInsertReviewDraft = (event: Event) => {
      const action = (event as CustomEvent).detail as AgentWebclientComposerDraftAction | undefined;
      const requestId = String(action?.requestId || "").trim();
      if (
        !action ||
        action.action !== AGENT_WEBCLIENT_COMPOSER_DRAFT_ACTION ||
        action.version !== AGENT_WEBCLIENT_COMPOSER_DRAFT_VERSION ||
        !requestId ||
        action.ownerChatId !== chatId ||
        typeof action.text !== "string" ||
        !action.text.trim() ||
        action.text.length > 50_000
      ) {
        if (requestId) emitComposerDraftResult(requestId, false, "invalid_request");
        return;
      }
      const stagedPng = readStagedPng(action);
      if (stagedPng === false || (stagedPng && !stageReviewAttachment(stagedPng))) {
        emitComposerDraftResult(requestId, false, "attachment_rejected");
        return;
      }
      setInputValue((current) => appendDesktopReviewDraft(current, action.text));
      window.requestAnimationFrame(() =>
        textareaRef.current?.focus({ preventScroll: true }),
      );
      emitComposerDraftResult(requestId, true);
    };
    window.addEventListener(DESKTOP_COMPOSER_REVIEW_DRAFT_EVENT, onInsertReviewDraft);
    return () => window.removeEventListener(
      DESKTOP_COMPOSER_REVIEW_DRAFT_EVENT,
      onInsertReviewDraft,
    );
  }, [chatId, setInputValue, stageReviewAttachment, textareaRef]);

  useEffect(() => {
    textareaRef.current?.focus({ preventScroll: true });
  }, [chatId, textareaRef]);

  useEffect(() => {
    if (!isVoiceMode) return;
    closeMention();
    setSlashDismissed(true);
  }, [closeMention, isVoiceMode, setSlashDismissed]);

  useEffect(() => {
    const onFocusComposer = () => {
      window.requestAnimationFrame(() => {
        const el = textareaRef.current?.resizableTextArea?.textArea;
        if (!el) return;
        el.focus({ preventScroll: true });
        const caret = el.value.length;
        el.setSelectionRange(caret, caret);
      });
    };

    window.addEventListener("agent:focus-composer", onFocusComposer);
    return () =>
      window.removeEventListener("agent:focus-composer", onFocusComposer);
  }, [textareaRef]);

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
  }, [closeMention, setInputValue, setSlashDismissed]);

  useEffect(() => {
    if (!isVoiceMode && !isFrontendActive) return;
    stopSpeechInput();
  }, [isFrontendActive, isVoiceMode, stopSpeechInput]);
}
