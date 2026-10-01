import React from "react";
import type { SubmissionDraft } from "../lib/composerState";
import { useI18n } from "@/shared/i18n";
import { UiButton } from "@/shared/ui/UiButton";
export function FailedSubmissions({ agentKey, chatId, drafts, restore, discard }: {
  agentKey: string; chatId: string; drafts: SubmissionDraft[];
  restore: (requestId: string) => void; discard: (requestId: string) => void;
}) {
  const { t } = useI18n();
  return <>{drafts.map(draft => <div role="status" key={draft.requestId} className="tw:p-2 tw:text-sm">
    <div>{t("composer.failedSubmission.title")} {draft.message.slice(0, 120)}</div>
    <div>{t("composer.failedSubmission.details", { references: draft.references.length, skills: draft.skills.length })}</div>
    <UiButton variant="ghost" size="sm" disabled={(!!draft.agentKey && draft.agentKey !== agentKey) || (!!draft.chatId && draft.chatId !== chatId)}
      title={t("composer.failedSubmission.restoreHint")}
      onClick={() => restore(draft.requestId)}>{t("composer.failedSubmission.restore")}</UiButton>
    <UiButton variant="ghost" size="sm" onClick={() => discard(draft.requestId)}>{t("composer.failedSubmission.discard")}</UiButton>
  </div>)}</>;
}
