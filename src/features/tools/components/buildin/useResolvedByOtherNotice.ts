import { message } from "antd";
import { useEffect, useRef } from "react";
import type { ActiveAwaitingResolutionReason } from "@/app/state/types";
import { useI18n } from "@/shared/i18n";

export function resolveAwaitingResolutionNoticeKey(input: {
	resolvedByOther?: boolean;
	resolutionReason?: ActiveAwaitingResolutionReason;
}): string {
	if (input.resolutionReason === "timeout") {
		return "approvalDialog.timeoutResolved";
	}
	if (input.resolutionReason === "remote_answered" || input.resolvedByOther) {
		return "approvalDialog.resolvedByOther";
	}
	return "";
}

export function useResolvedByOtherNotice(input: {
	resolvedByOther?: boolean;
	resolutionReason?: ActiveAwaitingResolutionReason;
	onResolvedByOther?: () => void;
}): void {
	const { resolvedByOther, resolutionReason, onResolvedByOther } = input;
	const { t } = useI18n();
	const handledRef = useRef(false);

	useEffect(() => {
		const noticeKey = resolveAwaitingResolutionNoticeKey({
			resolvedByOther,
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
		onResolvedByOther?.();
	}, [onResolvedByOther, resolutionReason, resolvedByOther, t]);
}
