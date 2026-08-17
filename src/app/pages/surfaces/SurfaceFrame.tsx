import React from "react";
import { useI18n } from "@/shared/i18n";

export const IndependentSurfaceFrame: React.FC<{
  kind: string;
  title: string;
  identity?: string;
  loading?: boolean;
  error?: string;
  notFound?: string;
  children?: React.ReactNode;
}> = ({
  kind,
  title,
  identity,
  loading = false,
  error = "",
  notFound = "",
  children,
}) => {
  const { t } = useI18n();
  return (
    <main className={`readonly-run-surface readonly-run-surface-${kind}`}>
      <header className="readonly-run-surface-header">
        <strong>{title}</strong>
        <span>{identity || ""}</span>
      </header>
      {loading ? <div className="status-line">{t("surface.loading")}</div> : null}
      {error ? <div className="system-alert" role="alert">{error}</div> : null}
      {!error && notFound ? (
        <div className="status-line" role="status">{notFound}</div>
      ) : null}
      <section className="readonly-run-surface-content">
        {!loading && !error && !notFound ? children : null}
      </section>
    </main>
  );
};
