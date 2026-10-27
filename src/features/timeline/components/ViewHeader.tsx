import { Popover } from "antd";
import { UiButton } from "@/shared/ui/UiButton";
import { useI18n } from "@/shared/i18n";

export interface ViewQueryStatus {
  pending: number;
  updatedAt?: number;
  failed: boolean;
}

/** Host-owned metadata stays outside the frozen connector template. */
export function ViewHeader({ dynamic = false, status, onExpand, onOpenSidebar, canExpand = true, onClose }: {
  /** Markdown views query current data themselves; tool-result views show the saved result. */
  dynamic?: boolean;
  status?: ViewQueryStatus;
  onExpand?: () => void;
  onOpenSidebar?: () => void;
  canExpand?: boolean;
  onClose?: () => void;
}) {
  const { t, locale } = useI18n();
  const updated = Boolean(status?.updatedAt);
  const state = status?.pending ? "querying" : status?.failed
    ? (updated ? "updateFailed" : "queryFailed")
    : "";
  const date = status?.updatedAt ? new Date(status.updatedAt) : undefined;
  const sameDay = date && date.toDateString() === new Date().toDateString();
  const time = date?.toLocaleString(locale, sameDay
    ? { hour: "2-digit", minute: "2-digit" }
    : { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
  const help = <div className="tw:flex tw:max-w-80 tw:items-start tw:gap-2 tw:text-xs tw:leading-5">
    <svg aria-hidden="true" className="tw:mt-0.5 tw:shrink-0 tw:text-ink-muted" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <circle cx="12" cy="12" r="9" /><path d="M12 7v6m0 4h.01" />
    </svg>
    <span>{t(dynamic ? "view.header.dynamicHelp" : "view.header.messageHelp")}</span>
  </div>;
  return <div className="view-header tw:mb-1 tw:flex tw:min-h-7 tw:items-center tw:gap-2 tw:border-b tw:border-line-soft tw:pb-1 tw:text-xs tw:leading-5 tw:text-ink-muted">
    <span className="tw:inline-flex tw:shrink-0 tw:items-center tw:gap-1 tw:font-medium tw:text-ink-2">
      <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" /><path d="M14 3v6h6M8 13h8M8 17h6" />
      </svg>
      {t("view.header.title")}
    </span>
    {!dynamic && <>
      <span aria-hidden="true" className="tw:opacity-50">·</span>
      <Popover trigger="click" content={help} placement="bottomLeft" destroyOnHidden>
        <button type="button" className="tw:shrink-0 tw:cursor-pointer tw:rounded tw:border-0 tw:bg-transparent tw:p-0 tw:text-xs tw:leading-5 tw:focus-visible:outline tw:focus-visible:outline-2 tw:text-ink-muted">
          {t("view.header.message")}
        </button>
      </Popover>
    </>}
    {date && <Popover trigger="click" content={help} placement="bottomLeft" destroyOnHidden>
      <button type="button" className="view-query-time tw:max-w-[40vw] tw:cursor-pointer tw:truncate tw:rounded tw:border-0 tw:bg-transparent tw:p-0 tw:text-xs tw:leading-5 tw:text-ink-muted tw:focus-visible:outline tw:focus-visible:outline-2" title={date.toLocaleString(locale)}>
        <time dateTime={date.toISOString()}>{t(status?.failed ? "view.header.lastSuccess" : "view.header.queriedAt", { time: time || "" })}</time>
      </button>
    </Popover>}
    <span role="status" aria-live="polite" className="tw:min-w-0 tw:truncate">{state && t(`view.header.${state}`)}</span>
    <div className="tw:ml-auto tw:flex tw:min-w-0 tw:shrink-0 tw:items-center tw:gap-2">
      {onExpand && <UiButton variant="ghost" size="mini" iconOnly disabled={!canExpand}
        aria-label={t("view.header.expand")} title={t("view.header.expand")} aria-haspopup="dialog"
        onClick={onExpand} className="tw:!h-6 tw:!w-6 tw:shrink-0 tw:!text-ink-muted">
        <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M8 3H3v5M16 3h5v5M21 16v5h-5M3 16v5h5M3 3l6 6M21 3l-6 6M21 21l-6-6M3 21l6-6" />
        </svg>
      </UiButton>}
      {onOpenSidebar && <UiButton variant="ghost" size="mini" iconOnly disabled={!canExpand}
        aria-label={t("view.header.openSidebar")} title={t("view.header.openSidebar")}
        onClick={onOpenSidebar} className="tw:!h-6 tw:!w-6 tw:shrink-0 tw:!text-ink-muted">
        <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="3" width="18" height="18" rx="2" /><path d="M9 3v18m4-12 3 3-3 3" />
        </svg>
      </UiButton>}
      {onClose && <UiButton variant="ghost" size="mini" iconOnly onClick={onClose}
        aria-label={t("view.header.close")} title={t("view.header.close")}
        className="tw:!h-6 tw:!w-6 tw:shrink-0 tw:!text-ink-muted">
        <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="m6 6 12 12M18 6 6 18" /></svg>
      </UiButton>}
    </div>
  </div>;
}
