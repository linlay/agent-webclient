import React from "react";
import { Button, Popover, Space, Tooltip } from "antd";
import { useI18n } from "@/shared/i18n";
import { MaterialIcon } from "@/shared/ui/MaterialIcon";
import { HTML_ELEMENT_REVIEW_MAX } from "../lib/htmlElementReview";

export const HtmlElementReviewToolbar: React.FC<{
  listOpen: boolean;
  count: number;
  onBack: () => void;
  onToggleList: () => void;
  onRefresh: () => void;
  listContent: React.ReactNode;
}> = ({ listOpen, count, onBack, onToggleList, onRefresh, listContent }) => {
  const { t } = useI18n();
  return (
    <div className="tw:flex tw:items-center tw:justify-between tw:gap-2 tw:border-b tw:border-line-soft tw:px-2 tw:py-1.5">
      <Space size={4} className="tw:min-w-0">
        <Button size="small" onClick={onBack}>
          {t("contentViewer.htmlReview.back")}
        </Button>
        <span className="tw:hidden tw:truncate tw:text-xs tw:text-ink-muted tw:sm:inline">
          {t("contentViewer.htmlReview.hint")}
        </span>
      </Space>
      <Space size={4}>
        <Popover
          open={listOpen}
          onOpenChange={(next) => {
            if (next !== listOpen) onToggleList();
          }}
          trigger="click"
          placement="bottomRight"
          arrow={false}
          destroyOnHidden
          content={listContent}
          styles={{ body: { padding: 0 } }}
        >
          <Button
            size="small"
            type={listOpen ? "primary" : "default"}
            aria-expanded={listOpen}
          >
            {t("contentViewer.htmlReview.count", {
              count,
              max: HTML_ELEMENT_REVIEW_MAX,
            })}
          </Button>
        </Popover>
        <Tooltip title={t("contentViewer.htmlReview.refresh")}>
          <Button
            size="small"
            type="text"
            aria-label={t("contentViewer.htmlReview.refresh")}
            icon={<MaterialIcon name="refresh" />}
            onClick={onRefresh}
          />
        </Tooltip>
      </Space>
    </div>
  );
};
