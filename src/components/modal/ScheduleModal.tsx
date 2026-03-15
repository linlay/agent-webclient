import React from "react";
import { MaterialIcon } from "../common/MaterialIcon";
import { UiButton } from "../ui/UiButton";
import { UiInput } from "../ui/UiInput";

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
	return (
		<div className="command-modal-section command-schedule-form">
			<div className="field-group">
				<label htmlFor="schedule-task-input">任务内容</label>
				<UiInput
					ref={scheduleTaskRef}
					id="schedule-task-input"
					inputSize="md"
					type="text"
					placeholder="例如：每天整理客户日报"
					value={scheduleTask}
					onChange={(event) => onTaskChange(event.target.value)}
				/>
			</div>
			<div className="field-group">
				<label htmlFor="schedule-rule-input">执行时间 / 规则</label>
				<UiInput
					id="schedule-rule-input"
					inputSize="md"
					type="text"
					placeholder="例如：每个工作日 18:00"
					value={scheduleRule}
					onChange={(event) => onRuleChange(event.target.value)}
				/>
				<p className="settings-hint">
					确认后会生成带当前员工上下文的草稿，按需再发送。支持 `Ctrl/Cmd + Enter` 快速确认。
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
					<span>生成草稿</span>
				</UiButton>
				<UiButton variant="ghost" size="sm" onClick={onCancel}>
					取消
				</UiButton>
			</div>
		</div>
	);
};
