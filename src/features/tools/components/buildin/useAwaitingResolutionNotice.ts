import { message } from "antd";
import { useEffect, useRef } from "react";
import type { ActiveAwaitingResolutionReason } from "@/app/state/types";
import { useI18n } from "@/shared/i18n";

export function resolveAwaitingResolutionNoticeKey(input: {
	resolutionReason?: ActiveAwaitingResolutionReason;
}): string {
	if (input.resolutionReason === "timeout") {
		return "approvalDialog.timeoutResolved";
	}
	if (input.resolutionReason === "remote_answered") {
		return "approvalDialog.remoteAnswered";
	}
	return "";
}

export function useAwaitingResolutionNotice(input: {
	resolutionReason?: ActiveAwaitingResolutionReason;
	onResolved?: () => void;
}): void {
	const { resolutionReason, onResolved } = input;
	const { t } = useI18n();
	const handledRef = useRef(false);

	useEffect(() => {
		const noticeKey = resolveAwaitingResolutionNoticeKey({
			resolutionReason,
		});
		if (!noticeKey) {
			handledRef.current = false;
			return;
		}
		if (handledRef.current) {
			return;
		}
		handledRef.current = true;
		void message.info(t(noticeKey));
		onResolved?.();
	}, [onResolved, resolutionReason, t]);
}
