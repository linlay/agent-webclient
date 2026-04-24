import React from "react";
import type { CommandModalType } from "@/app/state/types";
import { t } from "@/shared/i18n";
import { UiButton } from "@/shared/ui/UiButton";

function getTitle(type: CommandModalType): string {
	if (type === "history") return t("commandModal.history.title");
	if (type === "switch") return t("commandModal.switch.title");
	if (type === "detail") return t("commandModal.detail.title");
	if (type === "schedule") return t("commandModal.schedule.title");
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
				{t("commandModal.close")}
			</UiButton>
		</div>
	);
};
