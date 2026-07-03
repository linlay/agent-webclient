import React from "react";
import type { TimelineNode, TimelineSource } from "@/app/state/types";
import { useAppDispatch } from "@/app/state/AppContext";
import { useI18n } from "@/shared/i18n";
import { Flex } from "antd";
import { UiButton } from "@/shared/ui/UiButton";
import { MaterialIcon } from "@/shared/ui/MaterialIcon";
import { TimelineCollapse } from "./collapse";

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

const SOURCE_QUERY_CLASS_NAME = "source-query tw:text-ink-1 tw:opacity-60";
const SOURCE_LIST_CLASS_NAME = "source-list tw:flex tw:flex-wrap tw:gap-2";
const SOURCE_ITEM_CLASS_NAME = "source-item tw:flex tw:flex-col tw:gap-1.5";
const SOURCE_ITEM_ICON_CLASS_NAME = "tw:text-accent-electric-strong";

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
    <TimelineCollapse
      expanded={node.expanded}
      label={
        <Flex gap={6}>
          <span>{t("timeline.source.title", { count: sourceCount })}</span>
          <span className={SOURCE_QUERY_CLASS_NAME}>"{node.sourceQuery}"</span>
        </Flex>
      }
      onExpand={(expanded) => {
        dispatch({
          type: "SET_TIMELINE_NODE",
          id: node.id,
          node: {
            ...node,
            expanded,
          },
        });
      }}
    >
      <div className={SOURCE_LIST_CLASS_NAME}>
        {sources.map((source) => (
          <UiButton
            className={SOURCE_ITEM_CLASS_NAME}
            key={source.id}
            size="sm"
            onClick={() => openSource(source)}
          >
            <MaterialIcon className={SOURCE_ITEM_ICON_CLASS_NAME} name="article" />
            <span>{sourceName(source)}</span>
          </UiButton>
        ))}
      </div>
    </TimelineCollapse>
  );
};
