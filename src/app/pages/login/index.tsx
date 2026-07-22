import React, { useEffect, useMemo, useState } from "react";
import { Alert, Button, Card, Form, Input, Typography } from "antd";
import { useLocation } from "react-router-dom";
import { isGatewayBackendMode } from "@/shared/config/backendMode";
import {
	GatewaySessionError,
	getGatewaySession,
	loginWithGatewayCredentials,
} from "@/shared/data/auth/gatewaySession";
import {
	buildGatewayLoginUrl,
	sanitizeRelativeReturnTo,
} from "@/shared/data/auth/authCoordinator";
import { useI18n } from "@/shared/i18n";
import styles from "./LoginPage.module.css";

interface LoginFields {
	username: string;
	password: string;
}

export const LoginPage: React.FC = () => {
	const { t } = useI18n();
	const location = useLocation();
	const session = getGatewaySession();
	const [submitting, setSubmitting] = useState(false);
	const [error, setError] = useState("");
	const returnTo = useMemo(() => {
		const value = new URLSearchParams(location.search).get("return_to") || "/";
		return sanitizeRelativeReturnTo(value);
	}, [location.search]);

	useEffect(() => {
		if (!isGatewayBackendMode()) {
			window.location.replace("/");
			return;
		}
		if (session?.authenticated) {
			window.location.replace(returnTo);
		}
	}, [returnTo, session?.authenticated]);

	const submit = async (values: LoginFields) => {
		setSubmitting(true);
		setError("");
		try {
			await loginWithGatewayCredentials(values);
			window.location.replace(returnTo);
		} catch (reason) {
			if (reason instanceof GatewaySessionError && reason.status === 401) {
				setError(t("auth.login.invalidCredentials"));
			} else {
				setError(reason instanceof Error ? reason.message : String(reason));
			}
		} finally {
			setSubmitting(false);
		}
	};

	const startSSO = () => {
		window.location.assign(
			buildGatewayLoginUrl(session?.auth.loginUrl || "/auth/login", returnTo),
		);
	};

	return (
		<main className={styles.page}>
			<Card className={styles.card} bordered={false}>
				<div className={styles.brand}>
					{session?.tenant.logoUrl ? (
						<img src={session.tenant.logoUrl} alt="" className={styles.logo} />
					) : null}
					<Typography.Title level={2} className={styles.title}>
						{session?.tenant.displayName || t("auth.login.defaultTenant")}
					</Typography.Title>
					<Typography.Text type="secondary">
						{t("auth.login.subtitle")}
					</Typography.Text>
				</div>
				{error ? <Alert type="error" showIcon message={error} /> : null}
				{session?.auth.mode === "local" ? (
					<Form<LoginFields>
						layout="vertical"
						requiredMark={false}
						onFinish={submit}
					>
						<Form.Item
							label={t("auth.login.username")}
							name="username"
							rules={[{ required: true, message: t("auth.login.usernameRequired") }]}
						>
							<Input autoComplete="username" autoFocus />
						</Form.Item>
						<Form.Item
							label={t("auth.login.password")}
							name="password"
							rules={[{ required: true, message: t("auth.login.passwordRequired") }]}
						>
							<Input.Password autoComplete="current-password" />
						</Form.Item>
						<Button type="primary" htmlType="submit" block loading={submitting}>
							{t("auth.login.submit")}
						</Button>
					</Form>
				) : (
					<Button type="primary" block onClick={startSSO}>
						{t("auth.login.sso")}
					</Button>
				)}
			</Card>
		</main>
	);
};
