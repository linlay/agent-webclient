import { UiButton } from "@/shared/ui/UiButton";
import { useI18n } from "@/shared/i18n";

export interface ViewQueryStatus {
  pending: number;
  updatedAt?: number;
  failed: boolean;
}

/** Host-owned metadata stays outside the frozen connector template. */
export function ViewHeader({ query, status, onExpand, canExpand = true }: {
  query?: string;
  status?: ViewQueryStatus;
  onExpand?: () => void;
  canExpand?: boolean;
}) {
  const { t, locale } = useI18n();
  const dynamic = Boolean(query);
  const updated = Boolean(status?.updatedAt);
  const state = status?.pending ? "querying" : status?.failed
    ? (updated ? "updateFailed" : "queryFailed")
    : !dynamic && updated ? "updated" : "";
  const timestamp = status?.updatedAt;
  const date = timestamp ? new Date(timestamp) : undefined;
  const today = new Date();
  const sameDay = date && date.toDateString() === today.toDateString();
  const time = date?.toLocaleString(locale, sameDay
    ? { hour: "2-digit", minute: "2-digit" }
    : { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
  return <div className="view-header tw:mb-1 tw:flex tw:items-start tw:gap-2 tw:border-b tw:border-line-soft tw:pb-1 tw:text-xs tw:leading-6 tw:text-ink-muted">
    <details className="tw:min-w-0 tw:flex-1">
      <summary className="tw:flex tw:min-h-6 tw:cursor-pointer tw:list-none tw:flex-wrap tw:items-center tw:gap-x-2 tw:rounded tw:focus-visible:outline tw:focus-visible:outline-2 tw:focus-visible:outline-offset-2 tw:[&::-webkit-details-marker]:hidden">
        <span className={dynamic ? "tw:inline-flex tw:items-center tw:gap-1 tw:text-[var(--accent-electric)]" : "tw:inline-flex tw:items-center tw:gap-1"}>
          <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            {dynamic ? <><path d="M20 7v5h-5M4 17v-5h5" /><path d="M6.1 7a7 7 0 0 1 11.5-1L20 9M4 15l2.4 3A7 7 0 0 0 17.9 17" /></> : <><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" /><path d="M14 3v6h6M8 13h8M8 17h6" /></>}
          </svg>
          {t(dynamic ? "view.header.dynamic" : "view.header.message")}
        </span>
        <span role="status" aria-live="polite" className="tw:contents">
          {state && <span>{t(`view.header.${state}`)}</span>}
          {date && <time dateTime={date.toISOString()} title={date.toLocaleString(locale)}>
            {t(status?.failed ? "view.header.lastSuccess" : "view.header.queriedAt", { time: time || "" })}
          </time>}
        </span>
        <span aria-hidden="true" className="tw:ml-auto tw:opacity-60">ⓘ</span>
      </summary>
      <p className="tw:m-0 tw:py-1 tw:leading-5">{t(dynamic ? "view.header.dynamicHelp" : "view.header.messageHelp")}</p>
    </details>
    {onExpand && <UiButton variant="ghost" size="mini" iconOnly disabled={!canExpand}
      aria-label={t("view.header.expand")} title={t("view.header.expand")} aria-haspopup="dialog"
      onClick={onExpand} className="tw:!h-6 tw:!w-6 tw:shrink-0 tw:!text-ink-muted">
      <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M8 3H3v5M16 3h5v5M21 16v5h-5M3 16v5h5M3 3l6 6M21 3l-6 6M21 21l-6-6M3 21l6-6" />
      </svg>
    </UiButton>}
  </div>;
}
