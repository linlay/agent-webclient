import React, { useCallback, useRef, useState } from "react";
import { Button, Flex, Tooltip } from "antd";
import type { TimelineErrorDetail } from "@/app/state/types";
import { useI18n } from "@/shared/i18n";
import { copyText } from "@/shared/utils/copy";
import { UiButton } from "@/shared/ui/UiButton";

function hasTechnicalDetail(errorDetail?: TimelineErrorDetail): boolean {
  return Boolean(
    errorDetail &&
    (errorDetail.message ||
      errorDetail.code ||
      errorDetail.category ||
      errorDetail.scope ||
      errorDetail.status != null ||
      errorDetail.retryable != null ||
      errorDetail.diagnostics != null),
  );
}

function translateWithFallback(
  t: (key: string) => string,
  key: string,
  fallback: string,
): string {
  const translated = t(key);
  return translated === key ? fallback : translated;
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

function buildCopyPayload(
  text: string,
  errorDetail?: TimelineErrorDetail,
): string {
  const lines: string[] = [];
  if (text) {
    lines.push(text);
  }
  if (hasTechnicalDetail(errorDetail)) {
    const detailPayload = {
      code: errorDetail?.code,
      status: errorDetail?.status,
      category: errorDetail?.category,
      scope: errorDetail?.scope,
      retryable: errorDetail?.retryable,
      message: errorDetail?.message,
      diagnostics: errorDetail?.diagnostics ?? undefined,
    };
    lines.push(JSON.stringify(detailPayload, null, 2));
  }
  return lines.join("\n\n");
}

type CopyState = "idle" | "copied" | "error";

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

  const [copyState, setCopyState] = useState<CopyState>("idle");
  const copyTimerRef = useRef<number | null>(null);

  const handleCopy = useCallback(async () => {
    const payload = buildCopyPayload(text, errorDetail);
    if (!payload) return;
    try {
      await copyText(payload);
      setCopyState("copied");
    } catch {
      setCopyState("error");
    }
    if (copyTimerRef.current != null) {
      window.clearTimeout(copyTimerRef.current);
    }
    copyTimerRef.current = window.setTimeout(() => {
      setCopyState("idle");
      copyTimerRef.current = null;
    }, 1600);
  }, [text, errorDetail]);

  const copyLabel =
    copyState === "copied"
      ? t("timeline.systemAlert.copy.copied")
      : copyState === "error"
        ? t("timeline.systemAlert.copy.failed")
        : t("timeline.systemAlert.copy.action");
  const copyTooltip =
    copyState === "copied"
      ? t("timeline.systemAlert.copy.copied")
      : copyState === "error"
        ? t("timeline.systemAlert.copy.failed")
        : t("timeline.systemAlert.copy.tooltip");

  return (
    <div className="system-alert">
      <Flex justify="space-between" align="center" gap={6}>
        <div className="system-alert-message">{text}</div>
        <Tooltip title={copyTooltip}>
          <UiButton
            className="system-alert-copy-btn"
            variant="ghost"
            size="mini"
            onClick={handleCopy}
            aria-label={copyLabel}
          >
            {copyLabel}
          </UiButton>
        </Tooltip>
      </Flex>
      {showDetails && (
        <details className="system-alert-details">
          <summary>{t("platformError.technicalDetails")}</summary>
          <dl>
            {rows.map(([key, value]) => {
              const textValue = formatDetailValue(value);
              if (!textValue) return null;
              return (
                <React.Fragment key={key}>
                  <dt>
                    {translateWithFallback(
                      t,
                      `platformError.detail.${key}`,
                      key,
                    )}
                  </dt>
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
