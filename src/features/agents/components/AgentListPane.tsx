import { CreateMenuButton } from "@/shared/ui/CreateMenuButton";
import React, { useMemo, useState } from "react";
import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Input, Spin, Tag, Tooltip } from "antd";
import type { MenuProps } from "antd";
import type { Agent } from "@/features/agents/lib/agentState";
import { AgentIcon } from "@/shared/icons/agent";
import { MaterialIcon } from "@/shared/ui/MaterialIcon";
import { UiButton } from "@/shared/ui/UiButton";
import { RowMoreMenu } from "@/shared/ui/RowMoreMenu";
import { BottomSheet } from "@/shared/ui/BottomSheet";
import { useLongPress } from "@/shared/ui/hooks/useLongPress";

export interface AgentListSummary {
  mode: string;
  modelKey: string;
  toolsCount: number;
  skillsCount: number;
}

export interface AgentListPaneProps {
  agents: Agent[];
  selectedAgentKey: string;
  draggingAgentKey: string;
  loading: boolean;
  savingOrder: boolean;
  searchText: string;
  t: (key: string, vars?: Record<string, unknown>) => string;
  getSummary: (agent: Agent) => AgentListSummary;
  getDiagnostic: (agent: Agent) => string;
  isInvalid: (agent: Agent) => boolean;
  onSearchTextChange: (value: string) => void;
  onRefresh: () => void;
  onCreate: () => void;
  onCreateConversation?: () => void;
  onSelect: (agentKey: string) => void;
  onDraggingAgentKeyChange: (agentKey: string) => void;
  onMove: (sourceKey: string, targetKey: string) => void | Promise<void>;
  onEditConversation?: (agent: Agent) => void;
  onDelete?: (agent: Agent) => void;
  /** 移动端：行内「更多」改用 BottomSheet 动作面板。 */
  mobile?: boolean;
}

const MODE_LABEL: Record<string, string> = {
  GENERAL: "GENERAL",
 BOT: "BOT",
  REACT: "GENERAL",
  CODER: "CODER",
  KBASE: "KBASE",
  EXECUTOR: "EXECUTOR",
  PROXY: "PROXY",
};

function normalizeModeKey(value: string): string {
  const upper = value.trim().toUpperCase();
  if (upper === "ACP-PROXY" || upper === "ACP_PROXY" || upper === "PROXY")
    return "PROXY";
  return upper;
}

const ModeBadge: React.FC<{ mode: string }> = ({ mode }) => {
  const label = MODE_LABEL[normalizeModeKey(mode)];
  return label ? (
    <span className="agent-console-list-item-mode-badge">{label}</span>
  ) : null;
};

const SortableAgentListItem: React.FC<{
  agent: Agent;
  agentKey: string;
  diagnostic: string;
  disabled: boolean;
  active: boolean;
  dragging: boolean;
  invalid: boolean;
  name: string;
  sortableId: string;
  summary: AgentListSummary;
  t: AgentListPaneProps["t"];
  onSelect: (agentKey: string) => void;
  onEditConversation?: (agent: Agent) => void;
  onDelete?: (agent: Agent) => void;
  onRequestActions?: () => void;
}> = ({
  agent,
  agentKey,
  diagnostic,
  disabled,
  active,
  dragging,
  invalid,
  name,
  sortableId,
  summary,
  t,
  onSelect,
  onEditConversation,
  onDelete,
  onRequestActions,
}) => {
  const {
    attributes,
    listeners,
    setActivatorNodeRef,
    setNodeRef,
    transform,
    transition,
  } = useSortable({
    id: sortableId,
    disabled: disabled || !agentKey,
  });
  const { longPressProps, consumeClick } = useLongPress(onRequestActions, {
    ignoreTarget: (target) => Boolean(target.closest(".is-drag-handle")),
  });
  const moreLabel = t("leftSidebar.moreActions");
  const menuItems: MenuProps["items"] = [
    ...(onEditConversation
      ? [
          {
            key: "edit-conversation",
            icon: <MaterialIcon name="question_answer" />,
            label: t("resourceAssistant.conversationEdit"),
            disabled,
          },
        ]
      : []),
    ...(onEditConversation && onDelete ? [{ type: "divider" as const }] : []),
    ...(onDelete
      ? [
          {
            key: "delete",
            icon: <MaterialIcon name="delete" />,
            label: t("agentConsole.action.delete"),
            danger: true,
            disabled,
          },
        ]
      : []),
  ];
  const handleMenuClick: MenuProps["onClick"] = ({ key, domEvent }) => {
    domEvent.stopPropagation();
    if (disabled) return;
    if (key === "edit-conversation") onEditConversation?.(agent);
    if (key === "delete") onDelete?.(agent);
  };
  return (
    // 行容器承接拖拽变换，并作为右键菜单的触发区域；
    // 更多按钮的样式与点击/右键交互由共享 RowMoreMenu 统一提供。
    <RowMoreMenu
      items={menuItems}
      onSelect={handleMenuClick}
      label={moreLabel}
      ariaLabel={`${name}: ${moreLabel}`}
      disabled={disabled}
      className="agent-console-list-item-wrap"
      rowRef={setNodeRef}
      rowStyle={{ transform: CSS.Transform.toString(transform), transition }}
      onMoreClick={onRequestActions}
    >
      <div
        data-agent-identity=""
        role="button"
        tabIndex={0}
        className={`agent-console-list-item ${active ? "is-active" : ""} ${dragging ? "is-dragging" : ""} ${invalid ? "is-invalid" : ""}`}
        onClick={() => {
          if (consumeClick()) return;
          onSelect(agentKey);
        }}
        {...longPressProps}
        onKeyDown={(event) => {
          if (event.target !== event.currentTarget) return;
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            onSelect(agentKey);
          }
        }}
      >
        <span className="agent-console-list-item-icon-col">
          <span
            ref={setActivatorNodeRef}
            className={`agent-console-list-item-icon ${disabled || !agentKey ? "" : "is-drag-handle"}`}
            aria-label={t("agentConsole.list.dragHandle", { name })}
            {...attributes}
            {...listeners}
          >
            <AgentIcon
              icon={agent.icon} mode={agent.mode}
              type="agent"
              props={{
                icon: {
                  width: 28,
                  height: 28,
                  className: "agent-console-list-item-svg",
                },
                avatar: { size: 28, icon: <MaterialIcon name="smart_toy" /> },
              }}
            />
          </span>
        </span>
        <span className="agent-console-list-item-main">
          <span className="agent-console-list-item-row agent-console-list-item-head">
            <strong>{name}</strong>
            <span className="agent-console-list-item-head-meta">
              {invalid ? (
                <Tooltip title={diagnostic || undefined}>
                  <span>
                    <Tag color="error" style={{ marginRight: 0 }}>
                      {t("agentConsole.status.invalid")}
                    </Tag>
                  </span>
                </Tooltip>
              ) : (
                agentKey || "--"
              )}
            </span>
          </span>
          <span className="agent-console-list-item-row agent-console-list-item-meta">
            <span>{summary.modelKey}</span>
            <span className="agent-console-list-item-counts">
              <ModeBadge mode={summary.mode} />
            </span>
          </span>
        </span>
      </div>
    </RowMoreMenu>
  );
};

export const AgentListPane: React.FC<AgentListPaneProps> = (props) => {
  const [actionsAgent, setActionsAgent] = useState<Agent | null>(null);
  const [actionsOpen, setActionsOpen] = useState(false);
  const openActions = (agent: Agent) => {
    setActionsAgent(agent);
    setActionsOpen(true);
  };
  const runAction = (action: "edit" | "delete") => {
    const agent = actionsAgent;
    setActionsOpen(false);
    if (!agent) return;
    if (action === "edit") props.onEditConversation?.(agent);
    else props.onDelete?.(agent);
  };
  const actionsName = actionsAgent
    ? String(actionsAgent.name || "").trim() || String(actionsAgent.key || "")
    : "";
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );
  const sortableIds = useMemo(
    () =>
      props.agents.map(
        (agent, index) =>
          String(agent.key || "").trim() || `agent-console-empty-${index}`,
      ),
    [props.agents],
  );
  return (
    <div className="agent-console-list">
      <div className="agent-console-toolbar">
        <Input
          prefix={
            <MaterialIcon
              name="search"
              style={{ color: "var(--text-muted)" }}
            />
          }
          variant="filled"
          placeholder={props.t("agentConsole.searchPlaceholder")}
          value={props.searchText}
          onChange={(event) => props.onSearchTextChange(event.target.value)}
        />
        <UiButton
          size="sm"
          variant="ghost"
          iconOnly
          onClick={props.onRefresh}
          disabled={props.loading}
          loading={props.loading}
          aria-label={props.t("agentConsole.action.refresh")}
        >
          <MaterialIcon name="refresh" />
        </UiButton>
        <CreateMenuButton
          label={props.t("agentConsole.action.new")}
          onManual={props.onCreate}
          onConversation={props.onCreateConversation}
        />
      </div>
      <div className="agent-console-count">
        <span>
          {props.t("agentConsole.list.count", { count: props.agents.length })}
        </span>
        {props.savingOrder ? (
          <span>{props.t("agentConsole.list.savingOrder")}</span>
        ) : null}
      </div>
      <div className="agent-console-list-scroll">
        <Spin spinning={props.loading || props.savingOrder}>
          {props.agents.length === 0 ? (
            <div className="command-empty-state">
              {props.t("agentConsole.empty")}
              <UiButton size="sm" variant="primary" onClick={props.onCreate}>
                {props.t("agentConsole.action.create")}
              </UiButton>
            </div>
          ) : (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragStart={(event) =>
                props.onDraggingAgentKeyChange(String(event.active.id))
              }
              onDragCancel={() => props.onDraggingAgentKeyChange("")}
              onDragEnd={(event) => {
                props.onDraggingAgentKeyChange("");
                void props.onMove(
                  String(event.active.id),
                  event.over ? String(event.over.id) : "",
                );
              }}
            >
              <SortableContext
                items={sortableIds}
                strategy={verticalListSortingStrategy}
              >
                <div className="agent-console-list-items">
                  {props.agents.map((agent, index) => {
                    const agentKey = String(agent.key || "").trim();
                    const sortableId =
                      agentKey || `agent-console-empty-${index}`;
                    return (
                      <SortableAgentListItem
                        key={sortableId}
                        agent={agent}
                        agentKey={agentKey}
                        diagnostic={props.getDiagnostic(agent)}
                        disabled={props.savingOrder}
                        active={agentKey === props.selectedAgentKey}
                        dragging={agentKey === props.draggingAgentKey}
                        invalid={props.isInvalid(agent)}
                        name={String(agent.name || "").trim() || agentKey}
                        sortableId={sortableId}
                        summary={props.getSummary(agent)}
                        t={props.t}
                        onSelect={props.onSelect}
                        onEditConversation={props.onEditConversation}
                        onDelete={props.onDelete}
                        onRequestActions={
                          props.mobile &&
                          (props.onEditConversation || props.onDelete)
                            ? () => openActions(agent)
                            : undefined
                        }
                      />
                    );
                  })}
                </div>
              </SortableContext>
            </DndContext>
          )}
        </Spin>
      </div>
      {props.mobile ? (
        <BottomSheet
          open={actionsOpen}
          onClose={() => setActionsOpen(false)}
          ariaLabel={props.t("leftSidebar.moreActions")}
          getContainer=".layout-mobile"
        >
          <div className="agent-console-actions-sheet">
            <div className="agent-console-actions-sheet-title">{actionsName}</div>
            {props.onEditConversation ? (
              <button
                type="button"
                className="agent-console-actions-row"
                disabled={props.savingOrder}
                onClick={() => runAction("edit")}
              >
                <MaterialIcon name="question_answer" />
                <span>{props.t("resourceAssistant.conversationEdit")}</span>
              </button>
            ) : null}
            {props.onDelete ? (
              <button
                type="button"
                className="agent-console-actions-row is-danger"
                disabled={props.savingOrder}
                onClick={() => runAction("delete")}
              >
                <MaterialIcon name="delete" />
                <span>{props.t("agentConsole.action.delete")}</span>
              </button>
            ) : null}
          </div>
        </BottomSheet>
      ) : null}
    </div>
  );
};
