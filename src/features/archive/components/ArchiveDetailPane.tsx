import React from "react";
import { Spin } from "antd";
import type { ArchiveDetailResponse, ArchivedSummaryResponse } from "@/shared/data";
import { classifyEventGroup } from "@/features/events/lib/debugEventDisplay";
import { formatChatTimeLabel } from "@/features/chats/lib/chatListFormatter";
import { t } from "@/shared/i18n";

export interface ArchiveDetailPaneProps {
  selectedChatId: string;
  selectedItem?: ArchivedSummaryResponse;
  detail: ArchiveDetailResponse | null;
  loading: boolean;
  previewLines: Array<{ key: string; label: string; text: string }>;
  usageSummary: string;
}

const EVENT_GROUP_COLORS: Record<string, { text: string; bg: string }> = {
  request: { text: "#5a86c8", bg: "color-mix(in_srgb,#5a86c8_8%,var(--bg-elev-2))" },
  chat: { text: "#6b92bf", bg: "color-mix(in_srgb,#6b92bf_8%,var(--bg-elev-2))" },
  run: { text: "#4476ad", bg: "color-mix(in_srgb,#4476ad_8%,var(--bg-elev-2))" },
  debug: { text: "#7c8aa5", bg: "color-mix(in_srgb,#7c8aa5_8%,var(--bg-elev-2))" },
  awaiting: { text: "#d2b395", bg: "color-mix(in_srgb,#d2b395_8%,var(--bg-elev-2))" },
  content: { text: "#5aa79d", bg: "color-mix(in_srgb,#5aa79d_8%,var(--bg-elev-2))" },
  reasoning: { text: "#7ab9a8", bg: "color-mix(in_srgb,#7ab9a8_7%,var(--bg-elev-2))" },
  tool: { text: "#d6a05e", bg: "color-mix(in_srgb,#d6a05e_7%,var(--bg-elev-2))" },
  action: { text: "#ca9168", bg: "color-mix(in_srgb,#ca9168_8%,var(--bg-elev-2))" },
  plan: { text: "#8e82c4", bg: "color-mix(in_srgb,#8e82c4_8%,var(--bg-elev-2))" },
  task: { text: "#a094d0", bg: "color-mix(in_srgb,#a094d0_8%,var(--bg-elev-2))" },
  artifact: { text: "#d98a42", bg: "color-mix(in_srgb,#d98a42_8%,var(--bg-elev-2))" },
  source: { text: "#4f9fc7", bg: "color-mix(in_srgb,#4f9fc7_8%,var(--bg-elev-2))" },
};

function resolveGroupColors(eventType: string): { text?: string; bg?: string } {
  return EVENT_GROUP_COLORS[classifyEventGroup(eventType)] || {};
}

export const ArchiveDetailPane: React.FC<ArchiveDetailPaneProps> = (props) => (
  <section className="archive-detail-pane tw:min-h-0 tw:border-l tw:px-4 tw:py-2 tw:[border-color:color-mix(in_srgb,var(--line-soft)_92%,transparent)] tw:overflow-auto">
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
        </div>
        <div className="archive-detail-content tw:flex tw:min-h-0 tw:max-h-[520px] tw:flex-col tw:gap-2.5 tw:overflow-auto">
          {props.previewLines.length === 0 ? (
            <div className="command-empty-state">{t("archive.empty.detail")}</div>
          ) : props.previewLines.map((line) => {
            const colors = resolveGroupColors(line.label);
            return (
              <div
                className="archive-preview-line tw:rounded-[10px] tw:border tw:p-2.5 tw:px-3 tw:[border-color:color-mix(in_srgb,var(--line-soft)_92%,transparent)] tw:bg-[var(--control-input-bg)]"
                style={colors.bg ? { background: colors.bg } : undefined}
                key={line.key}
              >
                <div
                  className="archive-preview-label tw:mb-1.5 tw:font-code tw:text-[11px] tw:font-semibold tw:leading-[1.2] tw:text-ink-muted"
                  style={colors.text ? { color: colors.text } : undefined}
                >
                  {line.label}
                </div>
                <div className="archive-preview-text tw:whitespace-pre-wrap tw:break-words tw:text-[13px] tw:leading-[1.55] tw:text-ink-1">{line.text}</div>
              </div>
            );
          })}
        </div>
      </Spin>
    )}
  </section>
);
