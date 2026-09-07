import React from "react";
import { Alert, Button, Card, Form, Input, Typography } from "antd";
import {
  useGatewayLoginRuntime,
  type GatewayLoginFields,
} from "@/features/auth/hooks/useGatewayLoginRuntime";
import { useI18n } from "@/shared/i18n";
import styles from "./GatewayLoginScreen.module.css";

export const GatewayLoginScreen: React.FC<{ returnTo: string }> = ({ returnTo }) => {
  const { t } = useI18n();
  const { error, session, startSSO, submit, submitting } = useGatewayLoginRuntime(returnTo);
  return (
    <main className={styles.page}>
      <Card className={styles.card} bordered={false}>
        <div className={styles.brand}>
          {session?.tenant.logoUrl ? <img src={session.tenant.logoUrl} alt="" className={styles.logo} /> : null}
          <Typography.Title level={2} className={styles.title}>
            {session?.tenant.displayName || t("auth.login.defaultTenant")}
          </Typography.Title>
          <Typography.Text type="secondary">{t("auth.login.subtitle")}</Typography.Text>
        </div>
        {error ? <Alert type="error" showIcon message={error} /> : null}
        {session?.auth.mode === "local" ? (
          <Form<GatewayLoginFields> layout="vertical" requiredMark={false} onFinish={submit}>
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
          <Button type="primary" block onClick={startSSO}>{t("auth.login.sso")}</Button>
        )}
      </Card>
    </main>
  );
};
