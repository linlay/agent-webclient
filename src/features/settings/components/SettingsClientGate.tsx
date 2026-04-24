import React from "react";
import type { VoiceClientGateConfig } from "@/app/state/types";
import type {
  ClientGateDraftField,
  ClientGateDraftState,
} from "@/features/settings/lib/settingsClientGateDrafts";
import { useI18n } from "@/shared/i18n";
import { UiInput } from "@/shared/ui/UiInput";

interface SettingsClientGateProps {
  clientGate: VoiceClientGateConfig;
  clientGateDrafts: ClientGateDraftState;
  onEnabledChange: (enabled: boolean) => void;
  onDraftChange: (field: ClientGateDraftField, value: string) => void;
  onFieldFocus: (field: ClientGateDraftField) => void;
  onFieldCommit: (field: ClientGateDraftField) => void;
  onFieldKeyDown: (
    field: ClientGateDraftField,
    event: React.KeyboardEvent<HTMLInputElement>,
  ) => void;
}

interface NumericFieldProps {
  field: ClientGateDraftField;
  id: string;
  label: string;
  inputMode: React.HTMLAttributes<HTMLInputElement>["inputMode"];
  value: string;
  onDraftChange: (field: ClientGateDraftField, value: string) => void;
  onFieldFocus: (field: ClientGateDraftField) => void;
  onFieldCommit: (field: ClientGateDraftField) => void;
  onFieldKeyDown: (
    field: ClientGateDraftField,
    event: React.KeyboardEvent<HTMLInputElement>,
  ) => void;
}

const NumericField: React.FC<NumericFieldProps> = ({
  field,
  id,
  label,
  inputMode,
  value,
  onDraftChange,
  onFieldFocus,
  onFieldCommit,
  onFieldKeyDown,
}) => (
  <div className="field-group">
    <label htmlFor={id}>{label}</label>
    <UiInput
      id={id}
      inputSize="md"
      type="text"
      inputMode={inputMode}
      value={value}
      onChange={(event) => onDraftChange(field, event.target.value)}
      onFocus={() => onFieldFocus(field)}
      onBlur={() => onFieldCommit(field)}
      onKeyDown={(event) => onFieldKeyDown(field, event)}
    />
  </div>
);

export const SettingsClientGate: React.FC<SettingsClientGateProps> = ({
  clientGate,
  clientGateDrafts,
  onEnabledChange,
  onDraftChange,
  onFieldFocus,
  onFieldCommit,
  onFieldKeyDown,
}) => {
  const { t } = useI18n();

  return (
    <div className="field-group" style={{ marginTop: "14px" }}>
      <label htmlFor="client-gate-enabled">{t("settings.clientGate.label")}</label>
      <label className="settings-toggle" htmlFor="client-gate-enabled">
        <input
          id="client-gate-enabled"
          type="checkbox"
          checked={clientGate.enabled}
          onChange={(event) => onEnabledChange(event.target.checked)}
        />
        <span>{t("settings.clientGate.enabled")}</span>
      </label>
      <div className="settings-numeric-grid">
        <NumericField
          field="rmsThreshold"
          id="client-gate-threshold"
          label={t("settings.clientGate.field.rmsThreshold")}
          inputMode="decimal"
          value={clientGateDrafts.rmsThreshold}
          onDraftChange={onDraftChange}
          onFieldFocus={onFieldFocus}
          onFieldCommit={onFieldCommit}
          onFieldKeyDown={onFieldKeyDown}
        />
        <NumericField
          field="openHoldMs"
          id="client-gate-open-hold"
          label={t("settings.clientGate.field.openHoldMs")}
          inputMode="numeric"
          value={clientGateDrafts.openHoldMs}
          onDraftChange={onDraftChange}
          onFieldFocus={onFieldFocus}
          onFieldCommit={onFieldCommit}
          onFieldKeyDown={onFieldKeyDown}
        />
        <NumericField
          field="closeHoldMs"
          id="client-gate-close-hold"
          label={t("settings.clientGate.field.closeHoldMs")}
          inputMode="numeric"
          value={clientGateDrafts.closeHoldMs}
          onDraftChange={onDraftChange}
          onFieldFocus={onFieldFocus}
          onFieldCommit={onFieldCommit}
          onFieldKeyDown={onFieldKeyDown}
        />
        <NumericField
          field="preRollMs"
          id="client-gate-preroll"
          label={t("settings.clientGate.field.preRollMs")}
          inputMode="numeric"
          value={clientGateDrafts.preRollMs}
          onDraftChange={onDraftChange}
          onFieldFocus={onFieldFocus}
          onFieldCommit={onFieldCommit}
          onFieldKeyDown={onFieldKeyDown}
        />
      </div>
      <p className="settings-hint">{t("settings.clientGate.hint.primary")}</p>
      <p className="settings-hint">{t("settings.clientGate.hint.secondary")}</p>
    </div>
  );
};
