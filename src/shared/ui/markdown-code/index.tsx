import React, {
  useCallback,
  useMemo,
  useRef,
  useState,
} from "react";
import { MarkdownECharts } from "./MarkdownECharts";
import { MarkdownMermaid } from "./MarkdownMermaid";
import { App, Collapse, Flex, Tooltip } from "antd";
import { UiButton } from "../UiButton";
import { MaterialIcon } from "../MaterialIcon";
import { useAppDispatch, useAppState } from "@/app/state/AppContext";
import { useI18n } from "@/shared/i18n";
import { useDesktopContextMenuTarget } from "@/shared/data/desktop/desktopContextMenu";
import { copyText } from "@/shared/utils/copy";
import { useHighlightCode } from "./useHighlight";

import "./highlight-theme.css";
import Style from "./index.module.css";

type MarkdownCodeProps = React.HTMLAttributes<HTMLElement> & {
  lang?: string;
  block?: boolean;
  streamStatus?: "loading" | "done";
  domNode?: unknown;
};

const CODE_COLLAPSE_CLASS_NAME = [Style.Collapse, "tw:bg-bg-elev-1"].join(" ");

function isEChartsLanguage(lang?: string): boolean {
  const language = (lang || "").trim().split(/\s+/)[0]?.toLowerCase();
  return language === "echart" || language === "echarts";
}

function isMermaidLanguage(lang?: string): boolean {
  const language = (lang || "").trim().split(/\s+/)[0]?.toLowerCase();
  return language === "mermaid" || language === "mmd" || language === "mermind";
}

function getDefaultActiveKey(language: string): string {
  return isEChartsLanguage(language) || isMermaidLanguage(language)
    ? ""
    : language;
}

function textFromReactNode(node: React.ReactNode): string {
  if (typeof node === "string" || typeof node === "number") {
    return String(node);
  }
  if (Array.isArray(node)) {
    return node.map(textFromReactNode).join("");
  }
  if (React.isValidElement<{ children?: React.ReactNode }>(node)) {
    return textFromReactNode(node.props.children);
  }
  return "";
}

export const MarkdownCode: React.FC<MarkdownCodeProps> = ({
  lang,
  block,
  streamStatus,
  children,
  domNode: _domNode,
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
  const url = useRef("");
  const language = useMemo(() => lang || "plaintext", [lang]);
  const [activeKey, setActiveKey] = useState(() =>
    getDefaultActiveKey(language),
  );
  const text = useMemo(() => textFromReactNode(children), [children]);
  // highlight.js output is safe: highlight() escapes user input and only emits
  // <span> token wrappers, so dangerouslySetInnerHTML is acceptable here.
  const highlightedHtml = useHighlightCode(text, language);
  const contextTargetId = React.useId();
  const copyCode = useCallback(() => copyText(text).then(() => {
    message.success(t("markdown.copySuccess"));
  }), [message, t, text]);
  const contextTarget = useMemo(() => ({
    targetId: `code:${contextTargetId}`,
    kind: "code" as const,
    handlers: { "copy-code": copyCode },
  }), [contextTargetId, copyCode]);
  const contextTargetRef = useDesktopContextMenuTarget<HTMLDivElement>(contextTarget);
  const onCopy = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      void copyCode();
    },
    [copyCode],
  );
  const extraActions = useMemo(() => {
    if (language === "html") {
      return (
        <Flex>
          <Tooltip title={t("markdown.copy")}>
            <UiButton variant="ghost" className="ui-icon-hover-24" iconOnly onClick={onCopy}>
              <MaterialIcon name="content_copy" />
            </UiButton>
          </Tooltip>
          <Tooltip title={t("markdown.preview")}>
            <UiButton
              variant="ghost"
              className="ui-icon-hover-24"
              iconOnly
              onClick={(e) => {
                e.stopPropagation();
                const mimeType = "text/html;charset=utf-8";
                const blob = new Blob([text], { type: mimeType });
                url.current && URL.revokeObjectURL(url.current);
                url.current = URL.createObjectURL(blob);
                const preview = {
                  name: t("markdown.previewHtml"),
                  url: url.current,
                  downloadUrl: url.current,
                  sizeBytes: blob.size,
                  kind: "html" as const,
                };
                const isActive =
                  rightSidebarOpen &&
                  rightSidebarOpenTab === "preview" &&
                  activeAttachmentPreviewUrl === preview.url;
                if (isActive) {
                  dispatch({ type: "CLOSE_RIGHT_SIDEBAR" });
                } else if (attachmentPreview.some(p => p.url === preview.url)) {
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
        </Flex>
      );
    }
    return (
      <Tooltip title={t("markdown.copy")}>
        <UiButton variant="ghost" className="ui-icon-hover-24" iconOnly onClick={onCopy}>
          <MaterialIcon name="content_copy" />
        </UiButton>
      </Tooltip>
    );
  }, [dispatch, language, onCopy, t, text]);

  return block ? (
    <div ref={contextTargetRef}>
    <Flex vertical gap={10}>
      {isEChartsLanguage(language) && (
        <MarkdownECharts code={text} streamStatus={streamStatus} />
      )}
      {isMermaidLanguage(language) && (
        <MarkdownMermaid code={text} streamStatus={streamStatus} />
      )}
      <Collapse
        className={CODE_COLLAPSE_CLASS_NAME}
        activeKey={activeKey}
        onChange={setActiveKey as any}
        ghost
        expandIcon={({ isActive }) => (
          <MaterialIcon name="chevron_right" style={{ transform: isActive ? "rotate(90deg)" : undefined }} />
        )}
        items={[
          {
            key: language,
            label: language,
            children: (
              <code
                className="hljs"
                dangerouslySetInnerHTML={highlightedHtml}
              />
            ),
            extra: extraActions,
          },
        ]}
      />
    </Flex>
    </div>
  ) : (
    <code {...rest}>{children}</code>
  );
};
