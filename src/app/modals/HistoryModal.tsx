import React from "react";
import type { WorkerConversationRow } from "@/app/state/types";
import { isChatUnread } from "@/features/chats/lib/chatReadState";
import { formatChatTimeLabel } from "@/features/chats/lib/chatListFormatter";
import { UiInput } from "@/shared/ui/UiInput";
import { UiListItem } from "@/shared/ui/UiListItem";

export const HistoryModal: React.FC<{
  historyRows: WorkerConversationRow[];
  historyIndex: number;
  historySearch: string;
  historyInputRef: React.RefObject<HTMLInputElement>;
  historyListRef: React.RefObject<HTMLDivElement>;
  historyItemRefs: React.MutableRefObject<Array<HTMLButtonElement | null>>;
  onHistorySearchChange: (value: string) => void;
  onActivateIndex: (index: number) => void;
  onSelect: (index: number) => void;
}> = ({
  historyRows,
  historyIndex,
  historySearch,
  historyInputRef,
  historyListRef,
  historyItemRefs,
  onHistorySearchChange,
  onActivateIndex,
  onSelect,
}) => {
  return (
    <div className="command-modal-section">
      <UiInput
        ref={historyInputRef}
        id="history-search-input"
        inputSize="md"
        type="text"
        placeholder="搜索标题或预览..."
        value={historySearch}
        onChange={(event) => onHistorySearchChange(event.target.value)}
      />
      {historyRows.length === 0 ? (
        <div className="command-empty-state">当前对象暂无匹配历史对话。</div>
      ) : (
        <div
          ref={historyListRef}
          className="command-modal-list command-modal-list-focusable"
          tabIndex={0}
          role="listbox"
          aria-label="历史对话"
        >
          {historyRows.map((chat, index) => (
            <UiListItem
              key={chat.chatId}
              ref={(element) => {
                historyItemRefs.current[index] = element;
              }}
              className={`command-list-item ${index === historyIndex ? "is-active" : ""}`}
              selected={index === historyIndex}
              role="option"
              aria-selected={index === historyIndex}
              onMouseEnter={() => onActivateIndex(index)}
              onClick={() => onSelect(index)}
            >
              <div className="command-list-head">
                <strong
                  className={`command-list-title ${isChatUnread(chat) ? "" : ""}`}
                >
                  {isChatUnread(chat) ? (
                    <span className="chat-unread-dot is-unread" />
                  ) : null}
                  <span>{chat.chatName || chat.chatId}</span>
                </strong>
                <span>{formatChatTimeLabel(chat.updatedAt)}</span>
              </div>
              <div className="command-list-preview">
                {chat.searchSnippet || chat.lastRunContent || "(无预览)"}
              </div>
              {(chat.agentKey || chat.teamId) && (
                <div className="command-list-preview">
                  {[chat.agentKey, chat.teamId].filter(Boolean).join(" · ")}
                </div>
              )}
            </UiListItem>
          ))}
        </div>
      )}
    </div>
  );
};
