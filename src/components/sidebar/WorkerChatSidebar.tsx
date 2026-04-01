import React, { useMemo } from "react";
import {
  useAppState,
  useAppDispatch,
  useAppContext,
} from "../../context/AppContext";
import { formatChatTimeLabel } from "../../lib/chatListFormatter";
import { UiButton } from "../ui/UiButton";
import { UiListItem } from "../ui/UiListItem";
import { WorkerConversationRow } from "@/context/types";

export const WorkerChatSidebar: React.FC = () => {
  const { querySessionsRef } = useAppContext();
  const state = useAppState();
  const dispatch = useAppDispatch();

  const selectedWorker = useMemo(() => {
    return state.workerIndexByKey.get(state.workerSelectionKey) || null;
  }, [state.workerIndexByKey, state.workerSelectionKey]);

  if (state.conversationMode !== "worker" || !selectedWorker) {
    return null;
  }

  const title =
    selectedWorker.type === "team"
      ? `与小组 ${selectedWorker.displayName} 的对话`
      : `与员工 ${selectedWorker.displayName} 的对话`;

  const onLoadChat = (chatId: string) => {
    window.dispatchEvent(
      new CustomEvent("agent:load-chat", { detail: { chatId } }),
    );
  };

  const getLoading = (chat: WorkerConversationRow) => {
		if (!state.streaming) return false;
		
    for (const _session of querySessionsRef.current.values()) {
			if (_session.streaming && chat?.chatId === _session.chatId) {
        return true;
      }
    }
    return false;
  };

  return (
    <>
      <aside
        className={`worker-chat-sidebar ${state.workerChatPanelCollapsed ? "is-collapsed" : ""}`}
        aria-label="与当前员工的对话列表"
      >
        <div className="worker-chat-head">
          <h3>{title}</h3>
          <UiButton
            className="worker-chat-collapse-btn"
            variant="ghost"
            size="sm"
            aria-label="收起当前员工对话列表"
            onClick={() =>
              dispatch({
                type: "SET_WORKER_CHAT_PANEL_COLLAPSED",
                collapsed: true,
              })
            }
          >
            收起
          </UiButton>
        </div>
        <div className="worker-chat-list">
          {state.workerRelatedChats.length === 0 ? (
            <div className="status-line">暂无相关对话</div>
          ) : (
            state.workerRelatedChats.map((chat) => (
              <UiListItem
                key={chat.chatId}
                className={`worker-chat-item ${chat.chatId === state.chatId ? "is-active" : ""}`}
                selected={chat.chatId === state.chatId}
                loading={getLoading(chat)}
                onClick={() => onLoadChat(chat.chatId)}
              >
                <div className="worker-chat-item-head">
                  <span className="worker-chat-name">
                    {chat.chatName || chat.chatId}
                  </span>
                  <span className="worker-chat-time">
                    {formatChatTimeLabel(chat.updatedAt)}
                  </span>
                </div>
                <div className="worker-chat-preview">
                  {chat.lastRunContent || "(无预览)"}
                </div>
              </UiListItem>
            ))
          )}
        </div>
      </aside>

      {state.workerChatPanelCollapsed && (
        <UiButton
          className="worker-chat-float-btn"
          variant="secondary"
          size="sm"
          aria-label="展开当前对话列表"
          onClick={() =>
            dispatch({
              type: "SET_WORKER_CHAT_PANEL_COLLAPSED",
              collapsed: false,
            })
          }
        >
          当前对话
        </UiButton>
      )}
    </>
  );
};
