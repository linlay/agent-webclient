import type {
  Agent,
  Team,
  WorkerConversationRow,
  WorkerRow,
} from "@/app/state/types";
import type { MaterialIconName } from "@/shared/icons/material";

export type GlobalRow =
  | {
      kind: "action";
      key: string;
      label: string;
      icon: MaterialIconName;
      action: string;
    }
  | {
      kind: "worker";
      key: string;
      label: string;
      role: string;
      type: "agent" | "team";
      icon?: Agent["icon"] | Team["icon"];
    }
  | {
      kind: "history";
      key: string;
      chatId: string;
      label: string;
      snippet?: string;
      updatedAt: number;
      isUnread: boolean;
      hasPendingAwaiting: boolean;
      statusLabel?: string;
      hasActiveRun: boolean;
    };

export interface BuildGlobalRowsInput {
  workerRows: WorkerRow[];
  historyRows: WorkerConversationRow[];
  searchText: string;
  hasCurrentWorker: boolean;
  workerIcons?: ReadonlyMap<string, Agent["icon"] | Team["icon"]>;
  t: (key: string, params?: Record<string, unknown>) => string;
}

function getAwaitingStatusKey(mode?: string): string {
  switch (mode) {
    case "plan":
      return "leftSidebar.awaitingStatus.plan";
    case "question":
      return "leftSidebar.awaitingStatus.question";
    case "approval":
      return "leftSidebar.awaitingStatus.approval";
    case "form":
      return "leftSidebar.awaitingStatus.form";
    default:
      return "leftSidebar.awaitingApproval";
  }
}

export function buildGlobalRows(input: BuildGlobalRowsInput): GlobalRow[] {
  const { workerRows, historyRows, searchText, hasCurrentWorker, workerIcons, t } =
    input;
  const normalizedSearch = searchText.toLowerCase().trim();
  const rows: GlobalRow[] = [];

  const actions: GlobalRow[] = [];
  if (hasCurrentWorker) {
    actions.push({
      kind: "action",
      key: "newConversation",
      label: t("globalSearch.action.newConversation"),
      icon: "edit_square",
      action: "newConversation",
    });
    actions.push({
      kind: "action",
      key: "history",
      label: t("globalSearch.action.history"),
      icon: "history",
      action: "history",
    });
  }
  actions.push(
    {
      kind: "action",
      key: "switch",
      label: t("globalSearch.action.switch"),
      icon: "swap_horiz",
      action: "switch",
    },
    {
      kind: "action",
      key: "settings",
      label: t("globalSearch.action.settings"),
      icon: "settings",
      action: "settings",
    },
    {
      kind: "action",
      key: "debug",
      label: t("globalSearch.action.debug"),
      icon: "bug_report",
      action: "debug",
    },
  );

  if (!normalizedSearch) {
    rows.push(...actions);
  } else {
    const filteredActions = actions.filter((a) =>
      a.label.toLowerCase().includes(normalizedSearch),
    );
    rows.push(...filteredActions);
  }

  const filteredWorkers = workerRows
    .filter((row) => {
      if (!normalizedSearch) return true;
      return (
        row.searchText || row.displayName || ""
      )
        .toLowerCase()
        .includes(normalizedSearch);
    })
    .slice(0, 20);
  for (const w of filteredWorkers) {
    rows.push({
      kind: "worker",
      key: w.key,
      label: w.displayName,
      role: w.role,
      type: w.type as "agent" | "team",
      icon: workerIcons?.get(w.key),
    });
  }

  if (hasCurrentWorker) {
    const filteredHistory = historyRows
      .filter((row) => {
        if (!normalizedSearch) return true;
        const haystack = [row.chatName, row.chatId, row.lastRunContent]
          .join(" ")
          .toLowerCase();
        return haystack.includes(normalizedSearch);
      })
      .slice(0, 10);
    for (const h of filteredHistory) {
      rows.push({
        kind: "history",
        key: h.chatId,
        chatId: h.chatId,
        label: h.chatName || h.chatId || "",
        snippet: h.lastRunContent || undefined,
        updatedAt: h.updatedAt,
        isUnread: h.isRead === false,
        hasPendingAwaiting: h.hasPendingAwaiting || false,
        statusLabel: h.hasPendingAwaiting
          ? t(getAwaitingStatusKey(h.awaitingMode))
          : undefined,
        hasActiveRun: h.hasActiveRun || false,
      });
    }
  }

  return rows;
}
