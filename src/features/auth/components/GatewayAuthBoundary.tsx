import React, { useCallback, useEffect, useState } from "react";
import { Button, Result, Spin } from "antd";
import { isGatewayBackendMode } from "@/shared/config/backendMode";
import { initializeGatewaySession } from "@/shared/data/auth/gatewaySession";
import { useI18n } from "@/shared/i18n";

export const GatewayAuthBoundary: React.FC<{ children: React.ReactNode }> = ({
	children,
}) => {
	const gatewayMode = isGatewayBackendMode();
	const { t } = useI18n();
	const [status, setStatus] = useState<"loading" | "ready" | "error">(
		gatewayMode ? "loading" : "ready",
	);
	const [error, setError] = useState("");

	const bootstrap = useCallback(() => {
		if (!gatewayMode) return;
		setStatus("loading");
		setError("");
		void initializeGatewaySession()
			.then(() => setStatus("ready"))
			.catch((reason) => {
				setError(reason instanceof Error ? reason.message : String(reason));
				setStatus("error");
			});
	}, [gatewayMode]);

	useEffect(() => {
		bootstrap();
	}, [bootstrap]);

	if (status === "loading") {
		return (
			<div
				role="status"
				style={{ minHeight: "100vh", display: "grid", placeItems: "center" }}
			>
				<Spin size="large" tip={t("auth.session.loading")} />
			</div>
		);
	}
	if (status === "error") {
		return (
			<Result
				status="error"
				title={t("auth.session.failed")}
				subTitle={error}
				extra={<Button onClick={bootstrap}>{t("auth.action.retry")}</Button>}
			/>
		);
	}
	return <>{children}</>;
};
