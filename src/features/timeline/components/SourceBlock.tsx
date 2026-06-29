import React from "react";
import type {
  TimelineNode,
  TimelineSource,
  TimelineSourceChunk,
} from "@/app/state/types";
import { useAppDispatch } from "@/app/state/AppContext";
import { t as runtimeT, useI18n } from "@/shared/i18n";
import type { TranslateParams } from "@/shared/i18n";
import { Collapse, Flex } from "antd";
import { UiButton } from "@/shared/ui/UiButton";
import { MaterialIcon } from "@/shared/ui/MaterialIcon";
import Style from "./SourceBlock.module.css";


function basename(value: string): string {
  const normalized = value.replace(/\\/g, "/");
  const parts = normalized.split("/").filter(Boolean);
  return parts[parts.length - 1] || value;
}

function sourcePath(source: TimelineSource): string {
  return (
    source.title ||
    source.chunks.find((chunk) => chunk.path)?.path ||
    source.name ||
    source.id
  );
}

function sourceName(source: TimelineSource): string {
  return source.name || basename(sourcePath(source)) || source.id;
}

export interface SourceBlockProps {
  node: TimelineNode;
}

export const SourceBlock: React.FC<SourceBlockProps> = ({ node }) => {
  const dispatch = useAppDispatch();
  const { t } = useI18n();
  const sources = Array.isArray(node.sources) ? node.sources : [];
  const sourceCount = node.sourceCount ?? sources.length;

  const openSource = (source: TimelineSource) => {
    dispatch({
      type: "OPEN_RIGHT_SIDEBAR",
      tab: "sourceDetail",
      sourceDetail: source,
    });
  };

  return (
    <Collapse
      ghost
      className={Style.Collapse}
      expandIconPosition="end"
      items={[
        {
          key: "source-list",
          label: (
            <Flex gap={6}>
              <span>{t("timeline.source.title", { count: sourceCount })}</span>
              <span className="source-query">"{node.sourceQuery}"</span>
            </Flex>
          ),
          children: (
            <div className="source-list">
              {sources.map((source) => (
                <UiButton
                  className="source-item"
                  key={source.id}
                  size="sm"
                  onClick={() => openSource(source)}
                >
                  <MaterialIcon name="article" />
                  <span>{sourceName(source)}</span>
                </UiButton>
              ))}
            </div>
          ),
        },
      ]}
    />
  );
};
