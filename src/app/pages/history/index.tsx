import React from "react";
import { Input, Spin } from "antd";
import { useNavigate, useSearchParams } from "react-router-dom";
import type { Chat } from "@/app/state/types";
import { getChats } from "@/shared/data";
import { useI18n } from "@/shared/i18n";
import { MaterialIcon } from "@/shared/ui/MaterialIcon";
import { buildSurfaceRoute, readSurfacePresentationContext } from "@/features/surfaces/surfaceRoutes";

function chatAgentKey(chat: Chat): string {
  return String(chat.agentKey || chat.firstAgentKey || "").trim();
}

export const HistoryPage: React.FC = () => {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [routeSearch] = useSearchParams();
  const [query, setQuery] = React.useState("");
  const [chats, setChats] = React.useState<Chat[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState("");

  React.useEffect(() => {
    let disposed = false;
    setLoading(true);
    setError("");
    void getChats()
      .then((response) => {
        if (!disposed) setChats(Array.isArray(response.data) ? response.data as Chat[] : []);
      })
      .catch((cause: unknown) => {
        if (!disposed) setError(cause instanceof Error ? cause.message : String(cause));
      })
      .finally(() => {
        if (!disposed) setLoading(false);
      });
    return () => { disposed = true; };
  }, []);

  const rows = React.useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return chats
      .filter((chat) => {
        if (!normalized) return true;
        return [chat.chatName, chat.chatId, chat.lastRunContent]
          .join(" ")
          .toLowerCase()
          .includes(normalized);
      })
      .sort((a, b) => Number(b.updatedAt || 0) - Number(a.updatedAt || 0));
  }, [chats, query]);

  const openChat = (chat: Chat) => {
    const agentKey = chatAgentKey(chat);
    if (!agentKey) return;
    navigate(buildSurfaceRoute(
      { kind: "agent", agentKey, chatId: chat.chatId },
      readSurfacePresentationContext(routeSearch.toString()),
    ));
  };

  return (
    <main className="tw:flex tw:h-screen tw:flex-col tw:bg-bg-base tw:text-ink-1">
      <header className="tw:flex tw:items-center tw:gap-3 tw:border-b tw:border-line-soft tw:px-5 tw:py-4">
        <MaterialIcon name="history" />
        <strong>{t("leftSidebar.historyTitle")}</strong>
        <span className="tw:text-xs tw:text-ink-muted">{rows.length}</span>
      </header>
      <div className="tw:p-4">
        <Input
          value={query}
          allowClear
          placeholder={t("history.searchPlaceholder")}
          onChange={(event) => setQuery(event.target.value)}
        />
      </div>
      <section className="tw:min-h-0 tw:flex-1 tw:overflow-y-auto tw:px-4 tw:pb-4">
        {loading ? <div className="tw:grid tw:h-full tw:place-items-center"><Spin /></div> : null}
        {error ? <div className="system-alert" role="alert">{error}</div> : null}
        {!loading && !error && rows.length === 0 ? (
          <div className="command-empty-state">{t("history.empty")}</div>
        ) : null}
        <div className="tw:flex tw:flex-col tw:gap-2">
          {rows.map((chat) => {
            const agentKey = chatAgentKey(chat);
            return (
              <button
                key={chat.chatId}
                type="button"
                disabled={!agentKey}
                className="tw:flex tw:w-full tw:flex-col tw:gap-1 tw:rounded-xl tw:border tw:border-line-soft tw:bg-bg-card tw:px-4 tw:py-3 tw:text-left tw:hover:border-accent tw:disabled:cursor-not-allowed tw:disabled:opacity-50"
                onClick={() => openChat(chat)}
              >
                <span className="tw:flex tw:items-center tw:justify-between tw:gap-3">
                  <strong className="tw:truncate">{chat.chatName || t("leftSidebar.titleUntitled")}</strong>
                  <small className="tw:flex-none tw:text-ink-muted">{agentKey}</small>
                </span>
                <span className="tw:line-clamp-2 tw:text-xs tw:text-ink-muted">
                  {chat.lastRunContent || chat.chatId}
                </span>
              </button>
            );
          })}
        </div>
      </section>
    </main>
  );
};
