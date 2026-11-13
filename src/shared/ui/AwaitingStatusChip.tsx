import React from "react";
import { useI18n } from "@/shared/i18n";
import { awaitingStatusLabelKey } from "@/shared/i18n/awaitingStatus";
import { StatusChip, type StatusChipProps } from "./StatusChip";

export interface AwaitingStatusChipProps extends Omit<StatusChipProps, "tone" | "dot" | "pulse" | "shimmer" | "children"> {
  mode?: string | null;
}

/**
 * Chat awaiting badge. Keeps the historical `chat-awaiting-status` hook class
 * so skin and integration selectors outside this app keep matching.
 */
export const AwaitingStatusChip: React.FC<AwaitingStatusChipProps> = ({ mode, className = "", ...rest }) => {
  const { t } = useI18n();
  return (
    <StatusChip
      tone="pending"
      shimmer
      className={["chat-awaiting-status", className].filter(Boolean).join(" ")}
      {...rest}
    >
      {t(awaitingStatusLabelKey(mode))}
    </StatusChip>
  );
};
