import React, { useEffect, useMemo, useState } from "react";
import { Select } from "antd";
import type {
  Agent,
  AgentControl,
  AgentControlOption,
} from "@/app/state/types";
import { useAppState } from "@/app/state/AppContext";
import { resolveCurrentWorkerSummary } from "@/features/workers/lib/currentWorker";
import { useI18n } from "@/shared/i18n";

type ControlFieldValue = string | boolean;

interface ControlsFormProps {
  disabled?: boolean;
  onChange?: (params: Record<string, unknown>) => void;
}

const COMPOSER_CONTROL_FIELD_CLASS =
  "composer-control-field tw:inline-flex tw:flex-shrink-0 tw:items-center tw:gap-2.5 tw:whitespace-nowrap tw:after:block tw:after:h-1/2 tw:after:w-px tw:after:bg-line-soft tw:after:content-[''] tw:last:after:hidden";
const COMPOSER_CONTROL_LABEL_CLASS =
  "composer-control-label tw:text-[11px] tw:font-bold tw:text-ink-2 tw:[&_.material-icon]:text-[15px] tw:[&_.material-icon]:text-ink-muted";
const COMPOSER_CONTROL_INPUT_CLASS =
  "composer-control-input tw:w-[90px] tw:min-w-0 tw:rounded-lg tw:border tw:border-[color-mix(in_srgb,var(--line-soft)_82%,transparent)] tw:bg-[color-mix(in_srgb,var(--bg-input)_88%,var(--bg-elev-2))] tw:px-2 tw:py-[5px] tw:text-xs tw:leading-[1.2] tw:text-ink-1 tw:focus:border-accent-electric tw:focus:outline-none tw:focus:shadow-[0_0_0_3px_color-mix(in_srgb,var(--accent-soft)_24%,transparent)] tw:disabled:bg-[color-mix(in_srgb,var(--bg-elev-2)_92%,transparent)] tw:disabled:text-ink-muted";
const COMPOSER_CONTROL_SELECT_CLASS =
  "composer-control-select tw:w-[90px] tw:min-w-0 tw:text-xs";
const COMPOSER_CONTROL_TOGGLE_CLASS =
  "composer-control-toggle tw:accent-accent-electric";

function readText(value: unknown, fallback = ""): string {
  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return String(value);
  }
  if (!value || typeof value !== "object") {
    return fallback;
  }

  const record = value as Record<string, unknown>;
  return (
    readText(record.label) ||
    readText(record.name) ||
    readText(record.title) ||
    readText(record.text) ||
    readText(record.value) ||
    fallback
  );
}

function normalizeDateInputValue(value: unknown): string {
  const raw = String(value ?? "").trim();
  if (!raw) {
    return "";
  }
  const directMatch = raw.match(/^\d{4}-\d{2}-\d{2}/);
  if (directMatch) {
    return directMatch[0];
  }
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) {
    return "";
  }
  const year = parsed.getFullYear();
  const month = String(parsed.getMonth() + 1).padStart(2, "0");
  const day = String(parsed.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function serializeOptionValue(value: unknown): string {
  if (value === undefined) {
    return "";
  }
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function resolveOptionLabel(
  option: AgentControlOption,
  t: (key: string) => string,
): string {
  return readText(option.label, readText(option.value, t("composerControls.unnamedOption")));
}

function buildInitialFieldValues(
  controls: AgentControl[],
): Record<string, ControlFieldValue> {
  return controls.reduce<Record<string, ControlFieldValue>>((acc, control) => {
    const key = String(control.key || "").trim();
    if (!key) {
      return acc;
    }
    if (control.type === "switch") {
      acc[key] = Boolean(control.defaultValue);
      return acc;
    }
    if (control.type === "number") {
      acc[key] =
        control.defaultValue === undefined ||
        control.defaultValue === null ||
        String(control.defaultValue).trim() === ""
          ? ""
          : String(control.defaultValue);
      return acc;
    }
    if (control.type === "date") {
      acc[key] = normalizeDateInputValue(control.defaultValue);
      return acc;
    }
    if (control.type === "select") {
      acc[key] = serializeOptionValue(control.defaultValue);
      return acc;
    }
    acc[key] =
      control.defaultValue === undefined || control.defaultValue === null
        ? ""
        : String(control.defaultValue);
    return acc;
  }, {});
}

export function buildControlsParams(
  controls: AgentControl[],
  fieldValues: Record<string, ControlFieldValue>,
): Record<string, unknown> {
  return controls.reduce<Record<string, unknown>>((acc, control) => {
    const key = String(control.key || "").trim();
    if (!key) {
      return acc;
    }

    const rawValue = fieldValues[key];
    if (control.type === "switch") {
      acc[key] = Boolean(rawValue);
      return acc;
    }

    if (control.type === "number") {
      const text = String(rawValue ?? "").trim();
      if (!text) {
        return acc;
      }
      const numericValue = Number(text);
      if (Number.isFinite(numericValue)) {
        acc[key] = numericValue;
      }
      return acc;
    }

    if (control.type === "date") {
      const value = normalizeDateInputValue(rawValue);
      if (value) {
        acc[key] = value;
      }
      return acc;
    }

    if (control.type === "select") {
      const serialized = String(rawValue ?? "");
      if (!serialized) {
        return acc;
      }
      const matchedOption = (control.options || []).find(
        (option) => serializeOptionValue(option.value) === serialized,
      );
      acc[key] = matchedOption ? matchedOption.value : serialized;
      return acc;
    }

    const value = String(rawValue ?? "").trim();
    if (value) {
      acc[key] = value;
    }
    return acc;
  }, {});
}

function renderFieldInput(
  control: AgentControl,
  value: ControlFieldValue,
  disabled: boolean,
  onChange: (nextValue: ControlFieldValue) => void,
  t: (key: string) => string,
): React.ReactNode {
  if (control.type === "switch") {
    return (
      <input
        type="checkbox"
        className={COMPOSER_CONTROL_TOGGLE_CLASS}
        checked={Boolean(value)}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
      />
    );
  }

  if (control.type === "select") {
    const options = Array.isArray(control.options) ? control.options : [];
    const selectedValue = String(value ?? "");
    return (
      <Select<string>
        className={COMPOSER_CONTROL_SELECT_CLASS}
        size="small"
        placement="topLeft"
        popupMatchSelectWidth={false}
        showSearch={false}
        value={selectedValue || undefined}
        placeholder={t("composerControls.selectPlaceholder")}
        disabled={disabled}
        options={options.map((option) => ({
          value: serializeOptionValue(option.value),
          label: resolveOptionLabel(option, t),
        }))}
        onChange={onChange}
      />
    );
  }

  return (
    <input
      className={COMPOSER_CONTROL_INPUT_CLASS}
      type={
        control.type === "date"
          ? "date"
          : control.type === "number"
            ? "number"
            : "text"
      }
      inputMode={control.type === "number" ? "decimal" : undefined}
      value={String(value ?? "")}
      disabled={disabled}
      onChange={(event) => onChange(event.target.value)}
    />
  );
}

export const ControlsForm: React.FC<ControlsFormProps> = ({
  disabled = false,
  onChange,
}) => {
    const { t } = useI18n();
    const state = useAppState();
    const currentWorker = resolveCurrentWorkerSummary(state);
    const agent = useMemo(() => {
      if(currentWorker?.type === 'team') return null;
      return currentWorker?.raw as Agent;
    }, [currentWorker]);
  
  const controls = useMemo<AgentControl[]>(
    () =>
      Array.isArray(agent?.controls)
        ? agent.controls.filter(
            (control) =>
              Boolean(String(control?.key || "").trim()) &&
              Boolean(control?.type),
          )
        : [],
    [agent],
  );
  const controlSignature = useMemo(
    () =>
      JSON.stringify(
        controls.map((control) => ({
          key: control.key,
          type: control.type,
          defaultValue: control.defaultValue,
          options: (control.options || []).map((option) => ({
            value: option.value,
            label: option.label,
          })),
        })),
      ),
    [controls],
  );
  const initialFieldValues = useMemo(
    () => buildInitialFieldValues(controls),
    [controls, controlSignature],
  );
  const [fieldValues, setFieldValues] =
    useState<Record<string, ControlFieldValue>>(initialFieldValues);

  useEffect(() => {
    setFieldValues(initialFieldValues);
  }, [agent?.key, controlSignature, initialFieldValues]);

  useEffect(() => {
    onChange?.(buildControlsParams(controls, fieldValues));
  }, [controls, fieldValues, onChange]);

  if (controls.length === 0) {
    return null;
  }

  return controls.map((control) => {
    const key = String(control.key || "").trim();
    return (
      <label
        key={key}
        className={`${COMPOSER_CONTROL_FIELD_CLASS} is-${control.type}`.trim()}
      >
        <span className={COMPOSER_CONTROL_LABEL_CLASS}>{control.label}</span>
        {renderFieldInput(control, fieldValues[key], disabled, (nextValue) => {
          setFieldValues((current) => ({
            ...current,
            [key]: nextValue,
          }));
        }, t)}
      </label>
    );
  });
};
