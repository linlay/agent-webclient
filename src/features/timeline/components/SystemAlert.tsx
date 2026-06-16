import React from "react";
import type { TimelineErrorDetail } from "@/app/state/types";
import { useI18n } from "@/shared/i18n";

function hasTechnicalDetail(errorDetail?: TimelineErrorDetail): boolean {
	return Boolean(
		errorDetail &&
			(
				errorDetail.message ||
				errorDetail.code ||
				errorDetail.category ||
				errorDetail.scope ||
				errorDetail.status != null ||
				errorDetail.retryable != null ||
				errorDetail.diagnostics != null
			),
	);
}

function formatDetailValue(value: unknown): string {
	if (value == null || value === "") {
		return "";
	}
	if (typeof value === "string") {
		return value;
	}
	try {
		return JSON.stringify(value, null, 2);
	} catch {
		return String(value);
	}
}

export const SystemAlert: React.FC<{
	text: string;
	errorDetail?: TimelineErrorDetail;
}> = ({ text, errorDetail }) => {
	const { t } = useI18n();
	const showDetails = hasTechnicalDetail(errorDetail);
	const rows = [
		["code", errorDetail?.code],
		["status", errorDetail?.status],
		["category", errorDetail?.category],
		["scope", errorDetail?.scope],
		["retryable", errorDetail?.retryable],
		["message", errorDetail?.message],
	] as const;

	return (
		<div className="system-alert">
			<div className="system-alert-message">{text}</div>
			{showDetails && (
				<details className="system-alert-details">
					<summary>{t("platformError.technicalDetails")}</summary>
					<dl>
						{rows.map(([key, value]) => {
							const textValue = formatDetailValue(value);
							if (!textValue) return null;
							return (
								<React.Fragment key={key}>
									<dt>{t(`platformError.detail.${key}`)}</dt>
									<dd>{textValue}</dd>
								</React.Fragment>
							);
						})}
					</dl>
					{errorDetail?.diagnostics != null && (
						<pre>{formatDetailValue(errorDetail.diagnostics)}</pre>
					)}
				</details>
			)}
		</div>
	);
};
