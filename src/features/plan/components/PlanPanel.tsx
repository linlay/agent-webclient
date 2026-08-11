import React, { useEffect, useMemo, useState } from "react";
import { useAppState, useAppDispatch } from "@/app/state/AppContext";
import { buildPlanSummaryView, hasRunningPlanTask } from "@/features/plan/lib/planSummary";
import { MaterialIcon } from "@/shared/ui/MaterialIcon";
import { useI18n } from "@/shared/i18n";
import { UiButton } from "@/shared/ui/UiButton";
import { UiTag } from "@/shared/ui/UiTag";
import { Flex } from "antd";

export const PlanPanel: React.FC = () => {
  const state = useAppState();
  const dispatch = useAppDispatch();
  const { t } = useI18n();
  const [now, setNow] = useState(() => Date.now());

  const isConversationActive =
    state.streaming ||
    (Boolean(state.currentChatActiveRun?.runId) &&
      state.currentChatActiveRun?.chatId === state.chatId);

  useEffect(() => {
    if (!state.plan || !isConversationActive) {
      return;
    }
    const hasRunningTask = hasRunningPlanTask(state.planRuntimeByTaskId);
    if (!hasRunningTask) {
      return;
    }

    const timer = window.setInterval(() => {
      setNow(Date.now());
    }, 1000);
    return () => window.clearInterval(timer);
  }, [state.plan, state.planRuntimeByTaskId, isConversationActive]);

  if (!state.plan) return null;

  const planListId = `floating-plan-list-${String(state.plan.planId || "plan").replace(/[^a-zA-Z0-9_-]/g, "-")}`;
  const summary = useMemo(
    () => buildPlanSummaryView(
      state.plan,
      state.planRuntimeByTaskId,
      state.taskItemsById,
      t,
      now,
      isConversationActive,
    ),
    [state.plan, state.planRuntimeByTaskId, state.taskItemsById, now, t, isConversationActive],
  );

  return (
    <div
      className={`floating-plan ${state.planExpanded ? "is-expanded" : ""}`}
      id="floating-plan"
    >
      <UiButton
        className="plan-header"
        variant="ghost"
        size="sm"
        aria-expanded={state.planExpanded}
        aria-controls={planListId}
        onClick={() => {
          if (state.planAutoCollapseTimer) {
            window.clearTimeout(state.planAutoCollapseTimer);
            dispatch({ type: "SET_PLAN_AUTO_COLLAPSE_TIMER", timer: null });
          }
          dispatch({
            type: "SET_PLAN_EXPANDED",
            expanded: !state.planExpanded,
          });
          dispatch({
            type: "SET_PLAN_MANUAL_OVERRIDE",
            override: !state.planExpanded,
          });
        }}
      >
				<Flex align="center" gap={10}>
					<span className="plan-title">{summary.titleText}</span>
					<UiTag className="plan-summary-status" tone="accent">
						{summary.progressText}
					</UiTag>
					<span className="plan-header-badges" aria-hidden="true">
						{summary.normalizedTasks.map((task) => (
							<span
								key={task.taskId}
								className="tool-status-dot"
								data-tool-status={task.status}
							/>
						))}
					</span>
					<span className="plan-chevron" aria-hidden="true">
						<MaterialIcon
							name={
								state.planExpanded ? "keyboard_arrow_down" : "keyboard_arrow_up"
							}
						/>
					</span>
				</Flex>
      </UiButton>

      <ul className="plan-list" id={planListId}>
        {summary.normalizedTasks.map((task) => {
          return (
            <li
              key={task.taskId}
              className="plan-item"
              data-status={task.status}
            >
							<span
								className="tool-status-dot"
								data-tool-status={task.status}
							/>
              <span className="plan-item-text">
                {task.description || task.taskId}
              </span>
              {task.durationText ? (
                <span className="plan-item-duration">{task.durationText}</span>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
};
