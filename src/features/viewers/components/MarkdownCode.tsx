import React, {
  useCallback,
  useContext,
  useState,
  useEffect,
  useMemo,
  useRef,
} from "react";
import { App, Tooltip } from "antd";
import {
  ConversationMarkdownCode,
  getMarkdownCodeLanguage,
  textFromReactNode,
  type ConversationMarkdownCodeProps,
} from "@/shared/ui/markdown-code/ConversationMarkdownCode";
import { UiButton } from "@/shared/ui/UiButton";
import { MaterialIcon } from "@/shared/ui/MaterialIcon";
import { useAppDispatch, useAppState } from "@/app/state/AppContext";
import { useI18n } from "@/shared/i18n";
import { useDesktopContextMenuTarget } from "@/shared/data/desktop/desktopContextMenu";
import { copyText } from "@/shared/utils/copy";
import {
  buildResourceViewerTarget,
  getViewerTargetKey,
} from "@/features/viewers/lib/viewerTarget";
import { useOptionalWorkPanelTransport } from "@/features/transport/components/RealtimeTransportProvider";
import { buildHtmlDraftPreview } from "../lib/htmlDraftPreview";
import { HtmlDraftPreviewContext } from "./HtmlDraftPreviewContext";

export const MarkdownCode: React.FC<ConversationMarkdownCodeProps> = ({
  lang,
  block,
  children,
  htmlPreview = false,
  ...rest
}) => {
  const { message } = App.useApp();
  const { t } = useI18n();
  const dispatch = useAppDispatch();
  const {
    rightSidebarOpen,
    rightSidebarOpenTab,
    activeViewerKey,
  } = useAppState();
  const previewUrl = useRef("");
  const transport = useOptionalWorkPanelTransport();
  const previewContext = useContext(HtmlDraftPreviewContext);
  const previewContextRef = useRef(previewContext);
  previewContextRef.current = previewContext;
  const previewBusyRef = useRef(false);
  const mountedRef = useRef(true);
  const [previewPending, setPreviewPending] = useState(false);
  const language = useMemo(() => getMarkdownCodeLanguage(lang), [lang]);
  const text = useMemo(() => textFromReactNode(children), [children]);
  const contextTargetId = React.useId();
  const copyCode = useCallback(
    (source: string = text) => copyText(source).then(() => {
      message.success(t("markdown.copySuccess"));
    }).catch((error: unknown) => {
      message.error(t("timeline.toolPill.copy.failed"));
      throw error;
    }),
    [message, t, text],
  );
  const contextTarget = useMemo(
    () => block ? ({
      targetId: `code:${contextTargetId}`,
      kind: "code" as const,
      handlers: { "copy-code": () => copyCode() },
    }) : null,
    [block, contextTargetId, copyCode],
  );
  const contextTargetRef = useDesktopContextMenuTarget<HTMLDivElement>(contextTarget);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (previewUrl.current) URL.revokeObjectURL(previewUrl.current);
    };
  }, []);

  const previewAction = useMemo(() => {
    if (!block || language !== "html") return null;
    return (
      <Tooltip title={t("markdown.preview")}>
        <UiButton
          variant="ghost"
          className="ui-icon-hover-24"
          iconOnly
          loading={previewPending}
          onClick={async (event) => {
            event.stopPropagation();
            if (previewBusyRef.current) return;
            previewBusyRef.current = true;
            setPreviewPending(true);
            const context = previewContext;
            try {
              if (transport?.openHtmlDraft && context?.chatId && context.agentKey) {
                const draft = await buildHtmlDraftPreview(text, context);
                if (!mountedRef.current || context !== previewContextRef.current) return;
                if (!draft.ok && draft.reason === "too-large") {
                  message.error(t("markdown.previewTooLarge"));
                  return;
                }
                if (draft.ok) {
                  const result = await transport.openHtmlDraft({ source: draft.source, title: t("markdown.previewHtml") });
                  if (!mountedRef.current || context !== previewContextRef.current) return;
                  if (result?.ok) return;
                  if (result && result.error.code !== "unsupported_native_type") {
                    message.error(t("markdown.previewDesktopFailed")); return;
                  }
                }
              }

              const blob = new Blob([text], { type: "text/html;charset=utf-8" });
              if (previewUrl.current) URL.revokeObjectURL(previewUrl.current);
              previewUrl.current = URL.createObjectURL(blob);
              const viewerTarget = buildResourceViewerTarget({
                name: t("markdown.previewHtml"),
                url: previewUrl.current,
                sizeBytes: blob.size,
                mimeType: "text/html;charset=utf-8",
              });
              if (!viewerTarget) return;
              const viewerKey = getViewerTargetKey(viewerTarget);
              const isActive =
                rightSidebarOpen
                && rightSidebarOpenTab === "viewer"
                && activeViewerKey === viewerKey;
              if (isActive) {
                dispatch({ type: "CLOSE_RIGHT_SIDEBAR" });
              } else {
                dispatch({
                  type: "OPEN_RIGHT_SIDEBAR",
                  tab: "viewer",
                  viewerTarget,
                });
              }
            } catch {
              if (mountedRef.current) message.error(t("markdown.previewDesktopFailed"));
            } finally {
              previewBusyRef.current = false;
              if (mountedRef.current) setPreviewPending(false);
            }
          }}
        >
          <MaterialIcon name="expand_content" />
        </UiButton>
      </Tooltip>
    );
  }, [
    activeViewerKey,
    block,
    dispatch,
    language,
    rightSidebarOpen,
    rightSidebarOpenTab,
    t,
    text,
    transport,
    previewContext,
    previewPending,
    message,
  ]);

  const code = (
    <ConversationMarkdownCode
      {...rest}
      lang={lang}
      block={block}
      copyCode={copyCode}
      extraActions={previewAction}
      htmlPreview={htmlPreview}
    >
      {children}
    </ConversationMarkdownCode>
  );

  return block ? <div ref={contextTargetRef}>{code}</div> : code;
};

export { ConversationMarkdownCode } from "@/shared/ui/markdown-code/ConversationMarkdownCode";
export type { ConversationMarkdownCodeProps } from "@/shared/ui/markdown-code/ConversationMarkdownCode";
