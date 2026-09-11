import React from "react";
import { isGatewayBackendMode } from "@/shared/config/backendMode";
import {
  GatewaySessionError,
  getGatewaySession,
  loginWithGatewayCredentials,
} from "@/shared/data/auth/gatewaySession";
import { buildGatewayLoginUrl } from "@/shared/data/auth/authCoordinator";
import { useI18n } from "@/shared/i18n";

export interface GatewayLoginFields {
  username: string;
  password: string;
}

export function useGatewayLoginRuntime(returnTo: string) {
  const { t } = useI18n();
  const session = getGatewaySession();
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState("");

  React.useEffect(() => {
    if (!isGatewayBackendMode()) {
      window.location.replace("/");
    } else if (session?.authenticated) {
      window.location.replace(returnTo);
    }
  }, [returnTo, session?.authenticated]);

  const submit = React.useCallback(async (values: GatewayLoginFields) => {
    setSubmitting(true);
    setError("");
    try {
      await loginWithGatewayCredentials(values);
      window.location.replace(returnTo);
    } catch (reason) {
      setError(
        reason instanceof GatewaySessionError && reason.status === 401
          ? t("auth.login.invalidCredentials")
          : reason instanceof Error
            ? reason.message
            : String(reason),
      );
    } finally {
      setSubmitting(false);
    }
  }, [returnTo, t]);

  const startSSO = React.useCallback(() => {
    window.location.assign(
      buildGatewayLoginUrl(session?.auth.loginUrl || "/auth/login", returnTo),
    );
  }, [returnTo, session?.auth.loginUrl]);

  return { error, session, startSSO, submit, submitting };
}
