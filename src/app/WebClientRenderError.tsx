import React from "react";
import { isRouteErrorResponse, useRouteError } from "react-router-dom";
import { useI18n } from "@/shared/i18n";

type WebClientRenderErrorBoundaryProps = {
  children: React.ReactNode;
};

type WebClientRenderErrorBoundaryState = {
  componentStack: string;
  error: unknown;
  retryKey: number;
};

export type WebClientRenderErrorDetails = {
  message: string;
  stack: string;
};

function readErrorMessage(error: unknown): string {
  if (isRouteErrorResponse(error)) {
    const responseMessage =
      typeof error.data === "string"
        ? error.data
        : error.data && typeof error.data === "object" && "message" in error.data
          ? String(error.data.message || "")
          : "";
    return [error.status, error.statusText, responseMessage]
      .filter(Boolean)
      .join(" ");
  }
  if (error instanceof Error) {
    return `${error.name}: ${error.message}`;
  }
  if (typeof error === "string") {
    return error;
  }
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

export function resolveWebClientRenderErrorDetails(
  error: unknown,
  componentStack = "",
): WebClientRenderErrorDetails {
  const message = readErrorMessage(error).trim() || "Unknown rendering error";
  const errorStack = error instanceof Error ? String(error.stack || "").trim() : "";
  return {
    message,
    stack: [errorStack, componentStack.trim()].filter(Boolean).join("\n\n"),
  };
}

export const WebClientRenderErrorFallback: React.FC<{
  componentStack?: string;
  error: unknown;
  onReload?: () => void;
  onRetry?: () => void;
}> = ({ componentStack = "", error, onReload, onRetry }) => {
  const { t } = useI18n();
  const details = resolveWebClientRenderErrorDetails(error, componentStack);
  const reload = onReload ?? (() => window.location.reload());

  return (
    <main
      data-webclient-render-error="true"
      role="alert"
      style={{
        alignItems: "center",
        background: "var(--bg-base, #0d0e10)",
        boxSizing: "border-box",
        color: "var(--ink-1, #f2f3f5)",
        display: "flex",
        justifyContent: "center",
        minHeight: "100vh",
        padding: 24,
      }}
    >
      <section
        style={{
          background: "var(--bg-elevated, #202124)",
          border: "1px solid var(--border-muted, rgba(255,255,255,0.12))",
          borderRadius: 12,
          boxShadow: "0 18px 60px rgba(0,0,0,0.28)",
          maxWidth: 720,
          padding: 24,
          width: "100%",
        }}
      >
        <h1 style={{ fontSize: 20, margin: 0 }}>{t("renderError.title")}</h1>
        <p style={{ color: "var(--ink-muted, #a7abb4)", lineHeight: 1.6, margin: "10px 0 0" }}>
          {t("renderError.description")}
        </p>
        <pre
          style={{
            background: "rgba(0,0,0,0.24)",
            borderRadius: 8,
            fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
            fontSize: 12,
            lineHeight: 1.5,
            margin: "18px 0 0",
            maxHeight: 160,
            overflow: "auto",
            padding: 12,
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
          }}
        >
          {details.message}
        </pre>
        {details.stack ? (
          <details style={{ marginTop: 12 }}>
            <summary style={{ cursor: "pointer" }}>{t("renderError.details")}</summary>
            <pre
              style={{
                fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                fontSize: 11,
                lineHeight: 1.5,
                maxHeight: 240,
                overflow: "auto",
                whiteSpace: "pre-wrap",
              }}
            >
              {details.stack}
            </pre>
          </details>
        ) : null}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 20 }}>
          {onRetry ? (
            <button type="button" onClick={onRetry}>
              {t("renderError.retry")}
            </button>
          ) : null}
          <button type="button" onClick={reload}>
            {t("renderError.reload")}
          </button>
        </div>
      </section>
    </main>
  );
};

export class WebClientRenderErrorBoundary extends React.Component<
  WebClientRenderErrorBoundaryProps,
  WebClientRenderErrorBoundaryState
> {
  state: WebClientRenderErrorBoundaryState = {
    componentStack: "",
    error: null,
    retryKey: 0,
  };

  static getDerivedStateFromError(error: unknown): Partial<WebClientRenderErrorBoundaryState> {
    return { error };
  }

  componentDidCatch(error: unknown, info: React.ErrorInfo): void {
    console.error("[webclient-render-error]", error, info.componentStack);
    this.setState({ componentStack: info.componentStack || "" });
  }

  private retry = (): void => {
    this.setState((current) => ({
      componentStack: "",
      error: null,
      retryKey: current.retryKey + 1,
    }));
  };

  render(): React.ReactNode {
    if (this.state.error) {
      return (
        <WebClientRenderErrorFallback
          componentStack={this.state.componentStack}
          error={this.state.error}
          onRetry={this.retry}
        />
      );
    }

    return <React.Fragment key={this.state.retryKey}>{this.props.children}</React.Fragment>;
  }
}

export const WebClientRouteErrorPage: React.FC = () => {
  const error = useRouteError();
  return <WebClientRenderErrorFallback error={error} />;
};
