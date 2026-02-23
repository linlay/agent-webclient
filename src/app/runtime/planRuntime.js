import { PLAN_AUTO_COLLAPSE_MS } from '../context/constants.js';

function escapeHtml(input) {
  return String(input ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export function createPlanRuntime(ctx) {
  const { state, elements } = ctx;

  function normalizePlanStatus(status) {
    const value = String(status || 'pending').toLowerCase();

    if (['completed', 'done', 'success', 'ok'].includes(value)) {
      return 'completed';
    }

    if (['running', 'in_progress', 'working', 'doing'].includes(value)) {
      return 'running';
    }

    if (['failed', 'error'].includes(value)) {
      return 'failed';
    }

    if (['canceled', 'cancelled'].includes(value)) {
      return 'canceled';
    }

    if (['init', 'pending', 'todo'].includes(value)) {
      return 'pending';
    }

    return 'pending';
  }

  function normalizeTaskEventStatus(type) {
    if (type === 'task.start') {
      return 'running';
    }
    if (type === 'task.complete') {
      return 'completed';
    }
    if (type === 'task.cancel') {
      return 'canceled';
    }
    if (type === 'task.fail') {
      return 'failed';
    }
    return 'pending';
  }

  function syncPlanRuntime(planItems = []) {
    const nextRuntime = new Map();
    const normalizedItems = Array.isArray(planItems) ? planItems : [];
    for (const item of normalizedItems) {
      const taskId = String(item?.taskId || '').trim();
      if (!taskId) {
        continue;
      }
      const baseStatus = normalizePlanStatus(item.status);
      const existing = state.planRuntimeByTaskId.get(taskId);
      let mergedStatus = baseStatus;
      if (existing && mergedStatus === 'pending') {
        mergedStatus = existing.status || mergedStatus;
      }
      nextRuntime.set(taskId, {
        status: mergedStatus,
        updatedAt: existing?.updatedAt || Date.now(),
        error: existing?.error || ''
      });
    }
    state.planRuntimeByTaskId = nextRuntime;

    if (state.planCurrentRunningTaskId) {
      const running = state.planRuntimeByTaskId.get(state.planCurrentRunningTaskId);
      if (!running || running.status !== 'running') {
        state.planCurrentRunningTaskId = '';
      }
    }

    if (!state.planCurrentRunningTaskId) {
      const runningEntry = normalizedItems.find((item) => {
        const taskId = String(item?.taskId || '').trim();
        if (!taskId) {
          return false;
        }
        return state.planRuntimeByTaskId.get(taskId)?.status === 'running';
      });
      state.planCurrentRunningTaskId = runningEntry?.taskId || '';
    }
  }

  function applyTaskLifecycleEvent(event) {
    const taskId = String(event?.taskId || '').trim();
    if (!taskId) {
      return false;
    }
    const nextStatus = normalizeTaskEventStatus(event.type);
    const current = state.planRuntimeByTaskId.get(taskId) || {
      status: 'pending',
      updatedAt: Date.now(),
      error: ''
    };
    const next = {
      status: nextStatus,
      updatedAt: event.timestamp || Date.now(),
      error: event.type === 'task.fail'
        ? (typeof event.error === 'string' ? event.error : JSON.stringify(event.error || {}))
        : ''
    };
    state.planRuntimeByTaskId.set(taskId, next);
    state.planLastTouchedTaskId = taskId;

    if (event.type === 'task.start') {
      state.planCurrentRunningTaskId = taskId;
    } else if (state.planCurrentRunningTaskId === taskId) {
      state.planCurrentRunningTaskId = '';
    }

    if (state.plan && Array.isArray(state.plan.plan) && !state.plan.plan.some((item) => String(item?.taskId || '').trim() === taskId)) {
      state.plan.plan.push({
        taskId,
        description: event.description || event.taskName || '',
        status: next.status
      });
    } else if (state.plan && Array.isArray(state.plan.plan)) {
      state.plan.plan = state.plan.plan.map((item) => {
        if (String(item?.taskId || '').trim() !== taskId) {
          return item;
        }
        return {
          ...item,
          description: item.description || event.description || event.taskName || ''
        };
      });
    }

    return current.status !== next.status || current.error !== next.error;
  }

  function summarizePlan(planItems) {
    const normalized = planItems.map((item) => ({
      ...item,
      normalizedStatus: (() => {
        const taskId = String(item?.taskId || '').trim();
        const runtime = taskId ? state.planRuntimeByTaskId.get(taskId) : null;
        return normalizePlanStatus(runtime?.status || item.status);
      })()
    }));

    const running = state.planCurrentRunningTaskId
      ? normalized.find((item) => String(item.taskId || '').trim() === state.planCurrentRunningTaskId)
      : normalized.find((item) => item.normalizedStatus === 'running');
    const pending = normalized.find((item) => item.normalizedStatus === 'pending');
    const failed = normalized.find((item) => item.normalizedStatus === 'failed');
    const canceled = normalized.find((item) => item.normalizedStatus === 'canceled');
    const lastTouched = state.planLastTouchedTaskId
      ? normalized.find((item) => String(item.taskId || '').trim() === state.planLastTouchedTaskId)
      : null;
    const focus = running || lastTouched || failed || pending || canceled || normalized[normalized.length - 1] || null;
    const focusIndex = focus ? (normalized.indexOf(focus) + 1) : 0;

    return {
      normalized,
      current: focusIndex > 0 ? focusIndex : (normalized.length > 0 ? 1 : 0),
      total: normalized.length,
      summaryText: focus?.description || focus?.taskId || 'Plan updated'
    };
  }

  function clearPlanAutoCollapseTimer() {
    if (!state.planAutoCollapseTimer) {
      return;
    }

    window.clearTimeout(state.planAutoCollapseTimer);
    state.planAutoCollapseTimer = null;
  }

  function renderPlan() {
    if (!state.plan || !Array.isArray(state.plan.plan) || state.plan.plan.length === 0) {
      elements.planPanel.classList.add('hidden');
      elements.planPanel.classList.remove('is-expanded');
      elements.planToggleBtn.setAttribute('aria-expanded', 'false');
      elements.planIdLabel.textContent = '';
      elements.planList.innerHTML = '';
      elements.planSummaryStatus.textContent = '0/0';
      elements.planSummaryText.textContent = 'No active plan';
      clearPlanAutoCollapseTimer();
      return;
    }

    const planSummary = summarizePlan(state.plan.plan);

    elements.planPanel.classList.remove('hidden');
    elements.planPanel.classList.toggle('is-expanded', state.planExpanded);
    elements.planToggleBtn.setAttribute('aria-expanded', String(state.planExpanded));
    elements.planIdLabel.textContent = state.plan.planId ? `#${state.plan.planId}` : '#-';
    elements.planSummaryStatus.textContent = `${planSummary.current}/${planSummary.total}`;
    elements.planSummaryText.textContent = planSummary.summaryText;

    elements.planList.innerHTML = planSummary.normalized
      .map((item) => {
        const status = item.normalizedStatus;
        const task = item.taskId || '-';
        const description = item.description || '';
        return `<li class="plan-item" data-status="${escapeHtml(status)}"><span class="plan-badge" aria-hidden="true"></span><span>[${escapeHtml(status)}] ${escapeHtml(task)} · ${escapeHtml(description)}</span></li>`;
      })
      .join('');
  }

  function schedulePlanAutoCollapse() {
    clearPlanAutoCollapseTimer();

    state.planAutoCollapseTimer = window.setTimeout(() => {
      if (state.planManualOverride !== null) {
        return;
      }

      state.planExpanded = false;
      renderPlan();
    }, PLAN_AUTO_COLLAPSE_MS);
  }

  function setPlanExpanded(expanded, options = {}) {
    const { manual = false } = options;

    state.planExpanded = Boolean(expanded);

    if (manual) {
      state.planManualOverride = state.planExpanded;
      clearPlanAutoCollapseTimer();
    }

    renderPlan();
  }

  return {
    normalizePlanStatus,
    syncPlanRuntime,
    applyTaskLifecycleEvent,
    renderPlan,
    clearPlanAutoCollapseTimer,
    schedulePlanAutoCollapse,
    setPlanExpanded
  };
}
