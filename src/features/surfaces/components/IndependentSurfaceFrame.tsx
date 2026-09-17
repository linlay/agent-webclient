import React from "react";
import { useI18n } from "@/shared/i18n";
import styles from "./IndependentSurfaceFrame.module.css";

function withModuleClasses(...classNames: string[]): string {
  return [
    ...classNames,
    ...classNames.map((className) => styles[className]).filter(Boolean),
  ].filter(Boolean).join(" ");
}

export const IndependentSurfaceFrame: React.FC<{
  kind: string;
  loading?: boolean;
  error?: string;
  notFound?: string;
  onRetry?: () => void;
  flushContent?: boolean;
  embedded?: boolean;
  children?: React.ReactNode;
}> = ({
  kind,
  loading = false,
  error = "",
  notFound = "",
  onRetry,
  flushContent = false,
  embedded = false,
  children,
}) => {
  const { t } = useI18n();
  return (
    <main className={withModuleClasses("readonly-run-surface", `readonly-run-surface-${kind}`, embedded ? "is-embedded" : "")}>
      {loading ? <div className="status-line">{t("surface.loading")}</div> : null}
      {error ? (
        <div className={`system-alert ${withModuleClasses("readonly-run-surface-error")}`} role="alert">
          <span>{error}</span>
          {onRetry ? (
            <button type="button" onClick={onRetry}>{t("surface.retry")}</button>
          ) : null}
        </div>
      ) : null}
      {!error && notFound ? (
        <div className="status-line" role="status">{notFound}</div>
      ) : null}
      <section className={withModuleClasses(
        "readonly-run-surface-content",
        flushContent ? "is-flush" : "",
      )}>
        {!loading && !error && !notFound ? children : null}
      </section>
    </main>
  );
};
