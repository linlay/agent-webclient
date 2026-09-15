import { CreateMenuButton } from "@/shared/ui/CreateMenuButton";
import React, { useMemo } from "react";
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
import { Input, Spin } from "antd";
import type { Agent } from "@/features/agents/lib/agentState";
import { AgentIcon } from "@/shared/icons/agent";
import { MaterialIcon } from "@/shared/ui/MaterialIcon";
import { UiButton } from "@/shared/ui/UiButton";

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
}

const MODE_LABEL: Record<string, string> = {
  REACT: "REACT",
  CODER: "CODER",
  PLAN_EXECUTE: "P-E",
  PROXY: "PROXY",
};

function normalizeModeKey(value: string): string {
  const upper = value.trim().toUpperCase();
  if (upper === "PLAN-EXECUTE" || upper === "PLAN_EXECUTE") return "PLAN_EXECUTE";
  if (upper === "ACP-PROXY" || upper === "ACP_PROXY" || upper === "PROXY") return "PROXY";
  return upper;
}

const ModeBadge: React.FC<{ mode: string }> = ({ mode }) => {
  const label = MODE_LABEL[normalizeModeKey(mode)];
  return label ? (
    <span className="agent-console-list-item-mode-badge">
      <svg viewBox="0 0 24 24" fill="currentColor" stroke="none"><circle cx="12" cy="12" r="5" /></svg>
      <span>{label}</span>
    </span>
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
}> = ({ agent, agentKey, diagnostic, disabled, active, dragging, invalid, name, sortableId, summary, t, onSelect }) => {
  const { attributes, listeners, setActivatorNodeRef, setNodeRef, transform, transition } = useSortable({
    id: sortableId,
    disabled: disabled || !agentKey,
  });
  const isCoderMode = summary.mode.toUpperCase() === "CODER";
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      role="button"
      tabIndex={0}
      className={`agent-console-list-item ${active ? "is-active" : ""} ${dragging ? "is-dragging" : ""} ${invalid ? "is-invalid" : ""}`}
      onClick={() => onSelect(agentKey)}
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
            icon={agent.icon}
            type="agent"
            props={{
              icon: { width: 28, height: 28, className: "agent-console-list-item-svg" },
              avatar: { size: 28, icon: <MaterialIcon name="smart_toy" /> },
            }}
          />
        </span>
      </span>
      <span className="agent-console-list-item-main">
        <span className="agent-console-list-item-row agent-console-list-item-head">
          <strong>{name}</strong>
          {(invalid || !isCoderMode) ? (
            <span className="agent-console-list-item-head-meta">
              {invalid ? <span className="agent-console-status is-invalid">{t("agentConsole.status.invalid")}</span> : null}
              {!isCoderMode ? <span>{agentKey || "--"}</span> : null}
            </span>
          ) : null}
        </span>
        <span className="agent-console-list-item-row agent-console-list-item-meta">
          <span>{summary.modelKey}</span>
          <span className="agent-console-list-item-counts">
            <span className="agent-console-list-item-count">⚒ {summary.toolsCount}</span>
            <span className="agent-console-list-item-count-sep">·</span>
            <span className="agent-console-list-item-count">ϟ {summary.skillsCount}</span>
            <span className="agent-console-list-item-count-sep">·</span>
            <ModeBadge mode={summary.mode} />
          </span>
        </span>
        {invalid && diagnostic ? <span className="agent-console-list-item-diagnostic">{diagnostic}</span> : null}
      </span>
    </div>
  );
};

export const AgentListPane: React.FC<AgentListPaneProps> = (props) => {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const sortableIds = useMemo(
    () => props.agents.map((agent, index) => String(agent.key || "").trim() || `agent-console-empty-${index}`),
    [props.agents],
  );
  return (
    <div className="agent-console-list">
      <div className="agent-console-toolbar">
        <Input
          prefix={<MaterialIcon name="search" style={{ color: "var(--text-muted)" }} />}
          variant="filled"
          placeholder={props.t("agentConsole.searchPlaceholder")}
          value={props.searchText}
          onChange={(event) => props.onSearchTextChange(event.target.value)}
        />
        <UiButton size="sm" variant="ghost" iconOnly onClick={props.onRefresh} disabled={props.loading} loading={props.loading} aria-label={props.t("agentConsole.action.refresh")}>
          <MaterialIcon name="refresh" />
        </UiButton>
        <CreateMenuButton label={props.t("agentConsole.action.new")} onManual={props.onCreate} onConversation={props.onCreateConversation} />
      </div>
      <div className="agent-console-count">
        <span>{props.t("agentConsole.list.count", { count: props.agents.length })}</span>
        {props.savingOrder ? <span>{props.t("agentConsole.list.savingOrder")}</span> : null}
      </div>
      <div className="agent-console-list-scroll">
        <Spin spinning={props.loading || props.savingOrder}>
          {props.agents.length === 0 ? (
            <div className="command-empty-state">
              {props.t("agentConsole.empty")}
              <UiButton size="sm" variant="primary" onClick={props.onCreate}>{props.t("agentConsole.action.create")}</UiButton>
            </div>
          ) : (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragStart={(event) => props.onDraggingAgentKeyChange(String(event.active.id))}
              onDragCancel={() => props.onDraggingAgentKeyChange("")}
              onDragEnd={(event) => {
                props.onDraggingAgentKeyChange("");
                void props.onMove(String(event.active.id), event.over ? String(event.over.id) : "");
              }}
            >
              <SortableContext items={sortableIds} strategy={verticalListSortingStrategy}>
                <div className="agent-console-list-items">
                  {props.agents.map((agent, index) => {
                    const agentKey = String(agent.key || "").trim();
                    const sortableId = agentKey || `agent-console-empty-${index}`;
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
                      />
                    );
                  })}
                </div>
              </SortableContext>
            </DndContext>
          )}
        </Spin>
      </div>
    </div>
  );
};
