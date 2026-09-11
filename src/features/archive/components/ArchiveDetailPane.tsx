import React from "react";
import { Flex, Spin } from "antd";
import type { ArchiveDetailResponse, ArchivedSummaryResponse } from "@/shared/data";
import { formatChatTimeLabel } from "@/features/chats/lib/chatListFormatter";
import { MaterialIcon } from "@/shared/ui/MaterialIcon";
import { UiButton } from "@/shared/ui/UiButton";
import { t } from "@/shared/i18n";

export interface ArchiveDetailPaneProps {
  selectedChatId: string;
  selectedItem?: ArchivedSummaryResponse;
  detail: ArchiveDetailResponse | null;
  loading: boolean;
  previewLines: Array<{ key: string; label: string; text: string }>;
  usageSummary: string;
  canRestoreAndOpen: boolean;
  onRestore: (openAfterRestore: boolean) => void;
  onDelete: () => void;
}

export const ArchiveDetailPane: React.FC<ArchiveDetailPaneProps> = (props) => (
  <section className="archive-detail-pane tw:flex tw:min-h-0 tw:flex-col tw:gap-3 tw:border-l tw:pl-4 tw:[border-color:color-mix(in_srgb,var(--line-soft)_92%,transparent)]">
    {!props.selectedChatId ? (
      <div className="command-empty-state">{t("archive.empty.select")}</div>
    ) : (
      <Spin spinning={props.loading}>
        <div className="archive-detail-head tw:flex tw:items-start tw:justify-between tw:gap-3 tw:[&_h3]:m-0 tw:[&_h3]:text-base tw:[&_p]:mb-0 tw:[&_p]:mt-1 tw:[&_p]:text-xs tw:[&_p]:text-ink-muted">
          <div>
            <h3>{props.detail?.chatName || props.selectedItem?.chatName || props.selectedChatId}</h3>
            <p>
              {t("archive.detail.archivedAt", { time: formatChatTimeLabel(props.selectedItem?.archivedAt) })}
              {props.selectedItem?.agentKey ? ` · ${props.selectedItem.agentKey}` : ""}
              {props.usageSummary ? ` · ${props.usageSummary}` : ""}
            </p>
          </div>
          <Flex gap={8} wrap="wrap" justify="flex-end">
            <UiButton size="sm" variant="ghost" onClick={() => props.onRestore(false)}>
              <MaterialIcon name="unarchive" />
              {t("archive.action.restore")}
            </UiButton>
            {props.canRestoreAndOpen ? (
              <UiButton size="sm" variant="primary" onClick={() => props.onRestore(true)}>
                <MaterialIcon name="open_in_new" />
                {t("archive.action.restoreAndOpen")}
              </UiButton>
            ) : null}
            <UiButton size="sm" variant="ghost" onClick={props.onDelete}>
              <MaterialIcon name="delete" />
              {t("archive.action.delete")}
            </UiButton>
          </Flex>
        </div>
        <div className="archive-detail-content tw:flex tw:min-h-0 tw:max-h-[520px] tw:flex-col tw:gap-2.5 tw:overflow-auto tw:pr-1">
          {props.previewLines.length === 0 ? (
            <div className="command-empty-state">{t("archive.empty.detail")}</div>
          ) : props.previewLines.map((line) => (
            <div className="archive-preview-line tw:rounded-[10px] tw:border tw:p-2.5 tw:px-3 tw:[border-color:color-mix(in_srgb,var(--line-soft)_92%,transparent)] tw:bg-[var(--control-input-bg)]" key={line.key}>
              <div className="archive-preview-label tw:mb-1.5 tw:font-code tw:text-[11px] tw:font-semibold tw:leading-[1.2] tw:text-ink-muted">{line.label}</div>
              <div className="archive-preview-text tw:whitespace-pre-wrap tw:break-words tw:text-[13px] tw:leading-[1.55] tw:text-ink-1">{line.text}</div>
            </div>
          ))}
        </div>
      </Spin>
    )}
  </section>
);
