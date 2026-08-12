import React, {
  useCallback,
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
} from "./ConversationMarkdownCode";
import { UiButton } from "../UiButton";
import { MaterialIcon } from "../MaterialIcon";
import { useAppDispatch, useAppState } from "@/app/state/AppContext";
import { useI18n } from "@/shared/i18n";
import { useDesktopContextMenuTarget } from "@/shared/data/desktop/desktopContextMenu";
import { copyText } from "@/shared/utils/copy";
export const MarkdownCode: React.FC<ConversationMarkdownCodeProps> = ({
  lang,
  block,
  children,
  ...rest
}) => {
  const { message } = App.useApp();
  const { t } = useI18n();
  const dispatch = useAppDispatch();
  const {
    rightSidebarOpen,
    rightSidebarOpenTab,
    attachmentPreview,
    activeAttachmentPreviewUrl,
  } = useAppState();
  const previewUrl = useRef("");
  const language = useMemo(() => getMarkdownCodeLanguage(lang), [lang]);
  const text = useMemo(() => textFromReactNode(children), [children]);
  const contextTargetId = React.useId();
  const copyCode = useCallback(
    (source: string = text) => copyText(source).then(() => {
      message.success(t("markdown.copySuccess"));
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

  useEffect(() => () => {
    if (previewUrl.current) URL.revokeObjectURL(previewUrl.current);
  }, []);

  const previewAction = useMemo(() => {
    if (!block || language !== "html") return null;
    return (
      <Tooltip title={t("markdown.preview")}>
        <UiButton
          variant="ghost"
          className="ui-icon-hover-24"
          iconOnly
          onClick={(event) => {
            event.stopPropagation();
            const blob = new Blob([text], { type: "text/html;charset=utf-8" });
            if (previewUrl.current) URL.revokeObjectURL(previewUrl.current);
            previewUrl.current = URL.createObjectURL(blob);
            const preview = {
              name: t("markdown.previewHtml"),
              url: previewUrl.current,
              downloadUrl: previewUrl.current,
              sizeBytes: blob.size,
              kind: "html" as const,
            };
            const isActive =
              rightSidebarOpen
              && rightSidebarOpenTab === "preview"
              && activeAttachmentPreviewUrl === preview.url;
            if (isActive) {
              dispatch({ type: "CLOSE_RIGHT_SIDEBAR" });
            } else if (attachmentPreview.some((item) => item.url === preview.url)) {
              dispatch({
                type: "OPEN_RIGHT_SIDEBAR",
                tab: "preview",
                activeAttachmentPreviewUrl: preview.url,
              });
            } else {
              dispatch({
                type: "OPEN_RIGHT_SIDEBAR",
                tab: "preview",
                preview,
              });
            }
          }}
        >
          <MaterialIcon name="preview" />
        </UiButton>
      </Tooltip>
    );
  }, [
    activeAttachmentPreviewUrl,
    attachmentPreview,
    block,
    dispatch,
    language,
    rightSidebarOpen,
    rightSidebarOpenTab,
    t,
    text,
  ]);

  const code = (
    <ConversationMarkdownCode
      {...rest}
      lang={lang}
      block={block}
      copyCode={copyCode}
      extraActions={previewAction}
    >
      {children}
    </ConversationMarkdownCode>
  );

  return block ? <div ref={contextTargetRef}>{code}</div> : code;
};

export { ConversationMarkdownCode } from "./ConversationMarkdownCode";
export type { ConversationMarkdownCodeProps } from "./ConversationMarkdownCode";
