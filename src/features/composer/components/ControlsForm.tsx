import React, { useEffect, useMemo, useState } from "react";
import type {
  Agent,
  AgentControl,
  AgentControlOption,
} from "@/app/state/types";
import { useAppState } from "@/app/state/AppContext";
import { resolveCurrentWorkerSummary } from "@/features/workers/lib/currentWorker";

type ControlFieldValue = string | boolean;

interface ControlsFormProps {
  disabled?: boolean;
  onChange?: (params: Record<string, unknown>) => void;
}

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

function resolveOptionLabel(option: AgentControlOption): string {
  return readText(option.label, readText(option.value, "未命名选项"));
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
): React.ReactNode {
  if (control.type === "switch") {
    return (
      <input
        type="checkbox"
        className="composer-control-toggle"
        checked={Boolean(value)}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
      />
    );
  }

  if (control.type === "select") {
    const options = Array.isArray(control.options) ? control.options : [];
    return (
      <select
        className="composer-control-input"
        value={String(value ?? "")}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
      >
        <option value="">请选择</option>
        {options.map((option) => {
          const optionValue = serializeOptionValue(option.value);
          return (
            <option key={optionValue} value={optionValue}>
              {resolveOptionLabel(option)}
            </option>
          );
        })}
      </select>
    );
  }

  return (
    <input
      className="composer-control-input"
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
        className={`composer-control-field is-${control.type}`.trim()}
      >
        <span className="composer-control-label">{control.label}</span>
        {renderFieldInput(control, fieldValues[key], disabled, (nextValue) => {
          setFieldValues((current) => ({
            ...current,
            [key]: nextValue,
          }));
        })}
      </label>
    );
  });
};
