import React from "react";
import { useI18n } from "@/shared/i18n";
import { MaterialIcon } from "@/shared/ui/MaterialIcon";
import { UiButton } from "@/shared/ui/UiButton";
import { UiInput } from "@/shared/ui/UiInput";

export const ScheduleModal: React.FC<{
	scheduleTaskRef: React.RefObject<HTMLInputElement>;
	scheduleTask: string;
	scheduleRule: string;
	onTaskChange: (value: string) => void;
	onRuleChange: (value: string) => void;
	onConfirm: () => void;
	onCancel: () => void;
}> = ({
	scheduleTaskRef,
	scheduleTask,
	scheduleRule,
	onTaskChange,
	onRuleChange,
	onConfirm,
	onCancel,
}) => {
	const { t } = useI18n();

	return (
		<div className="command-modal-section command-schedule-form">
			<div className="field-group">
				<label htmlFor="schedule-task-input">{t("schedule.label.task")}</label>
				<UiInput
					ref={scheduleTaskRef}
					id="schedule-task-input"
					inputSize="md"
					type="text"
					placeholder={t("schedule.example.task")}
					value={scheduleTask}
					onChange={(event) => onTaskChange(event.target.value)}
				/>
			</div>
			<div className="field-group">
				<label htmlFor="schedule-rule-input">{t("schedule.label.rule")}</label>
				<UiInput
					id="schedule-rule-input"
					inputSize="md"
					type="text"
					placeholder={t("schedule.example.rule")}
					value={scheduleRule}
					onChange={(event) => onRuleChange(event.target.value)}
				/>
				<p className="settings-hint">
					{t("schedule.hint")}
				</p>
			</div>
			<div className="command-schedule-actions">
				<UiButton
					variant="primary"
					size="sm"
					disabled={!String(scheduleTask || "").trim() || !String(scheduleRule || "").trim()}
					onClick={onConfirm}
				>
					<MaterialIcon name="schedule" />
					<span>{t("schedule.action.generateDraft")}</span>
				</UiButton>
				<UiButton variant="ghost" size="sm" onClick={onCancel}>{t("commandModal.close")}</UiButton>
			</div>
		</div>
	);
};
