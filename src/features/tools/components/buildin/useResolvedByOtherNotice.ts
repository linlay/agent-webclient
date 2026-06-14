import { message } from "antd";
import { useEffect, useRef } from "react";
import { useI18n } from "@/shared/i18n";

export function useResolvedByOtherNotice(input: {
	resolvedByOther?: boolean;
	onResolvedByOther?: () => void;
}): void {
	const { resolvedByOther, onResolvedByOther } = input;
	const { t } = useI18n();
	const handledRef = useRef(false);

	useEffect(() => {
		if (!resolvedByOther) {
			handledRef.current = false;
			return;
		}
		if (handledRef.current) {
			return;
		}
		handledRef.current = true;
		void message.info(t("approvalDialog.resolvedByOther"));
		onResolvedByOther?.();
	}, [onResolvedByOther, resolvedByOther, t]);
}
