import React, { useEffect, useMemo, useState } from "react";
import { MarkdownECharts } from "./MarkdownECharts";
import { App, Collapse, Flex, Tooltip } from "antd";
import { UiButton } from "../UiButton";
import { MaterialIcon } from "../MaterialIcon";
import { CaretRightOutlined } from "@ant-design/icons";
import Style from "./index.module.css";

type MarkdownCodeProps = React.HTMLAttributes<HTMLElement> & {
  lang?: string;
  block?: boolean;
  streamStatus?: "loading" | "done";
  domNode?: unknown;
};

function isEChartsLanguage(lang?: string): boolean {
  const language = (lang || "").trim().split(/\s+/)[0]?.toLowerCase();
  return language === "echart" || language === "echarts";
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
  const language = useMemo(() => lang || "plaintext", [lang]);
  const [activeKey, setActiveKey] = useState(language);
  const text = useMemo(() => textFromReactNode(children), [children]);

  useEffect(() => {
    if (streamStatus === "done" && language.includes('echart')) {
      setActiveKey("");
    }
  }, [streamStatus]);
  
  return block ? (
    <Flex vertical gap={10}>
      {isEChartsLanguage(language) && (
        <MarkdownECharts
          code={text}
          streamStatus={streamStatus}
        />
      )}
      <Collapse
        className={Style.Collapse}
        activeKey={activeKey}
        onChange={setActiveKey as any}
        ghost
        expandIcon={({ isActive }) => (
          <CaretRightOutlined rotate={isActive ? 90 : 0} />
        )}
        items={[
          {
            key: language,
            label: language,
            children: <code>{children}</code>,
            extra: (
              <Tooltip title="复制">
                <UiButton variant="ghost" iconOnly onClick={(e) => {
                  e.stopPropagation();
                  navigator.clipboard.writeText(text).then(() => {
                    message.success("复制成功");
                  });
                }}>
                  <MaterialIcon name="content_copy" />
                </UiButton>
              </Tooltip>
            ),
          },
        ]}
      />
    </Flex>
  ) : (
    <code {...rest}>{children}</code>
  );
};
