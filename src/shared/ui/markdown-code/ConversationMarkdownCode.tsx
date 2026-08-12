import React, {
  useCallback,
  useMemo,
  useState,
} from "react";
import { Collapse, Flex, Tooltip } from "antd";
import type { ComponentProps } from "@ant-design/x-markdown";
import { MarkdownECharts } from "./MarkdownECharts";
import { MarkdownMermaid } from "./MarkdownMermaid";
import { MaterialIcon } from "../MaterialIcon";
import { UiButton } from "../UiButton";
import { useI18n } from "@/shared/i18n";
import { copyWebText } from "@/shared/utils/webClipboard";
import styles from "./index.module.css";
import { useHighlightCode } from "./useHighlight";
import "./highlight-theme.css";

export type ConversationMarkdownCodeProps = ComponentProps<{
  copyCode?: (text: string) => void | Promise<void>;
  extraActions?: React.ReactNode;
}>;

const CODE_COLLAPSE_CLASS_NAME = [
  styles.Collapse,
  "tw:bg-bg-elev-1",
].join(" ");

export function getMarkdownCodeLanguage(lang?: string): string {
  return (lang || "").trim().split(/\s+/u)[0]?.toLowerCase() || "plaintext";
}

export function isEChartsLanguage(lang?: string): boolean {
  const language = getMarkdownCodeLanguage(lang);
  return language === "echart" || language === "echarts";
}

export function isMermaidLanguage(lang?: string): boolean {
  const language = getMarkdownCodeLanguage(lang);
  return language === "mermaid" || language === "mmd" || language === "mermind";
}

function getDefaultActiveKey(language: string): string {
  return isEChartsLanguage(language) || isMermaidLanguage(language)
    ? ""
    : language;
}

export function textFromReactNode(node: React.ReactNode): string {
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

export const ConversationMarkdownCode: React.FC<ConversationMarkdownCodeProps> = ({
  lang,
  block,
  streamStatus,
  children,
  domNode: _domNode,
  copyCode,
  extraActions,
  ...rest
}) => {
  const { t } = useI18n();
  const language = useMemo(() => getMarkdownCodeLanguage(lang), [lang]);
  const text = useMemo(() => textFromReactNode(children), [children]);
  // highlight.js escapes source text and emits only span wrappers.
  const highlightedHtml = useHighlightCode(text, language);
  const [activeKey, setActiveKey] = useState<string | string[]>(() =>
    getDefaultActiveKey(language),
  );
  const handleCopy = useCallback(
    (event: React.MouseEvent): void => {
      event.stopPropagation();
      void Promise.resolve(copyCode ? copyCode(text) : copyWebText(text));
    },
    [copyCode, text],
  );

  if (!block) {
    return <code {...rest}>{children}</code>;
  }

  return (
    <Flex vertical gap={10}>
      {isEChartsLanguage(language) ? (
        <MarkdownECharts code={text} streamStatus={streamStatus} />
      ) : null}
      {isMermaidLanguage(language) ? (
        <MarkdownMermaid code={text} streamStatus={streamStatus} />
      ) : null}
      <Collapse
        className={CODE_COLLAPSE_CLASS_NAME}
        activeKey={activeKey}
        onChange={setActiveKey}
        ghost
        expandIcon={({ isActive }) => (
          <span className={isActive ? styles.ExpandIconOpen : styles.ExpandIcon}>
            <MaterialIcon name="chevron_right" />
          </span>
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
            extra: (
              <Flex align="center">
                <Tooltip title={t("markdown.copy")}>
                  <UiButton
                    variant="ghost"
                    className="ui-icon-hover-24"
                    iconOnly
                    onClick={handleCopy}
                  >
                    <MaterialIcon name="content_copy" />
                  </UiButton>
                </Tooltip>
                {extraActions}
              </Flex>
            ),
          },
        ]}
      />
    </Flex>
  );
};
