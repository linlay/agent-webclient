import React, { useEffect, useRef, useState } from "react";
import { Button, Drawer, List, Space } from "antd";
import { useAppState } from "@/app/state/AppContext";
import { useI18n } from "@/shared/i18n";
import { getChats } from "@/shared/data";
import type { Agent } from "@/features/agents/lib/agentState";
import type { Chat } from "../lib/chatState";

export function BotChatHeader() {
  const state = useAppState();
  const current = state.chats.find(chat => chat.chatId === state.chatId);
  const agentKey = current?.agentKey || state.chatAgentById.get(state.chatId) ||
    state.workerSelectionKey.replace(/^agent:/, "");
  const agent = state.agents.find(item => item.key === agentKey);
  if (!agent || String(agent.mode || "").toUpperCase() !== "BOT") return null;
  const main = !state.chatId || agent.primaryChat?.chatId === state.chatId || current?.primary === true;
  return <BotChatControls key={agent.key} agent={agent} main={main} />;
}

function BotChatControls({ agent, main }: { agent: Agent; main: boolean }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [chats, setChats] = useState<Chat[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [more, setMore] = useState(false);
  const generation = useRef(0);

  useEffect(() => {
    if (!open) return;
    const request = ++generation.current;
    setLoading(true);
    setError("");
    void getChats({ agentKey: agent.key, primary: false, limit: 50 })
      .then(({ data }) => {
        if (request !== generation.current) return;
        const rows = Array.isArray(data) ? data as Chat[] : [];
        setChats(rows);
        setMore(rows.length === 50 && Boolean(rows[rows.length - 1]?.lastRunId));
      })
      .catch(error => {
        if (request === generation.current) setError(String(error.message || error));
      })
      .finally(() => {
        if (request === generation.current) setLoading(false);
      });
    return () => { generation.current++; };
  }, [open, agent.key]);

  const select = (chatId: string) => {
    setOpen(false);
    window.dispatchEvent(new CustomEvent("agent:load-chat", { detail: { chatId } }));
  };
  const next = async () => {
    const lastRunId = chats[chats.length - 1]?.lastRunId;
    if (!lastRunId || loading) return;
    const request = generation.current;
    setLoading(true);
    setError("");
    try {
      const { data } = await getChats({ agentKey: agent.key, primary: false, limit: 50, lastRunId });
      if (request !== generation.current) return;
      const rows = Array.isArray(data) ? data as Chat[] : [];
      setChats(old => [...old, ...rows.filter(row => !old.some(item => item.chatId === row.chatId))]);
      setMore(rows.length === 50 && Boolean(rows[rows.length - 1]?.lastRunId));
    } catch (error) {
      if (request === generation.current) setError(String((error as Error).message || error));
    } finally {
      if (request === generation.current) setLoading(false);
    }
  };

  return <>
    <Space className="tw:px-4 tw:py-1 tw:text-xs tw:text-text-muted">
      <span>{agent.name} · {t(main ? "bot.mainChat" : "bot.workerChat")}</span>
      {!main && agent.primaryChat?.chatId && <Button type="link" size="small"
        onClick={() => select(agent.primaryChat!.chatId)}>{t("bot.backToMain")}</Button>}
      <Button type="link" size="small" onClick={() => setOpen(true)}>{t("bot.workerHistory")}</Button>
    </Space>
    <Drawer open={open} onClose={() => setOpen(false)} title={t("bot.workerHistory")}>
      {error && <p role="alert">{error}</p>}
      <List loading={loading} dataSource={chats} renderItem={chat => <List.Item>
        <Button type="link" onClick={() => select(chat.chatId)}>{chat.chatName || chat.chatId}</Button>
      </List.Item>} />
      {more && <Button loading={loading} onClick={() => void next()}>{t("bot.moreHistory")}</Button>}
    </Drawer>
  </>;
}
