import React from "react";
import type { CommandModalType } from "../../context/types";
import { UiButton } from "../ui/UiButton";

function getTitle(type: CommandModalType): string {
	if (type === "history") return "历史对话";
	if (type === "switch") return "切换员工";
	if (type === "detail") return "当前详情";
	if (type === "schedule") return "计划任务";
	return "";
}

export const CommandModalHeader: React.FC<{
	type: CommandModalType;
	subtitle: string;
	closeButtonRef: React.RefObject<HTMLButtonElement>;
	onClose: () => void;
}> = ({ type, subtitle, closeButtonRef, onClose }) => {
	return (
		<div className="command-modal-head">
			<div>
				<h3>{getTitle(type)}</h3>
				<p className="command-modal-subtitle">{subtitle}</p>
			</div>
			<UiButton ref={closeButtonRef} variant="ghost" size="sm" onClick={onClose}>
				关闭
			</UiButton>
		</div>
	);
};
