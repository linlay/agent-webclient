import React from "react";
import { useI18n } from "@/shared/i18n";

export const IndependentSurfaceFrame: React.FC<{
  kind: string;
  loading?: boolean;
  error?: string;
  notFound?: string;
  onRetry?: () => void;
  children?: React.ReactNode;
}> = ({
  kind,
  loading = false,
  error = "",
  notFound = "",
  onRetry,
  children,
}) => {
  const { t } = useI18n();
  return (
    <main className={`readonly-run-surface readonly-run-surface-${kind}`}>
      {loading ? <div className="status-line">{t("surface.loading")}</div> : null}
      {error ? (
        <div className="system-alert readonly-run-surface-error" role="alert">
          <span>{error}</span>
          {onRetry ? (
            <button type="button" onClick={onRetry}>{t("surface.retry")}</button>
          ) : null}
        </div>
      ) : null}
      {!error && notFound ? (
        <div className="status-line" role="status">{notFound}</div>
      ) : null}
      <section className="readonly-run-surface-content">
        {!loading && !error && !notFound ? children : null}
      </section>
    </main>
  );
};
