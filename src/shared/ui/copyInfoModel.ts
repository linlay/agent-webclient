export interface CopyInfoRow {
  key: string;
  label: string;
  displayValue: string;
  copyValue: string;
  code?: boolean;
}

export interface CopyInfoGroup {
  key: string;
  label: string;
  rows: CopyInfoRow[];
  collapsed?: boolean;
}

export interface CopyInfoRowOptions {
  displayValue?: string;
  copyValue?: string;
  code?: boolean;
}

function isPrimitive(value: unknown): boolean {
  return (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  );
}

export function stringifyCopyInfoValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (Array.isArray(value) && value.every(isPrimitive)) {
    return value.map((item) => String(item)).join(", ");
  }
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

export function createCopyInfoRow(
  key: string,
  label: string,
  value: unknown,
  options: CopyInfoRowOptions = {},
): CopyInfoRow | null {
  const copyValue = options.copyValue ?? stringifyCopyInfoValue(value);
  if (!copyValue.trim()) return null;

  const displayValue = options.displayValue ?? copyValue;
  const inferredCode =
    typeof value === "object" &&
    value !== null &&
    !(Array.isArray(value) && value.every(isPrimitive));

  return {
    key,
    label,
    displayValue,
    copyValue,
    code: options.code ?? inferredCode,
  };
}

export function compactCopyInfoRows(
  rows: Array<CopyInfoRow | null>,
): CopyInfoRow[] {
  return rows.filter((row): row is CopyInfoRow => Boolean(row));
}

export function buildCopyAllText(groups: CopyInfoGroup[]): string {
  return groups
    .flatMap((group) => group.rows)
    .map((row) => `${row.label}: ${row.copyValue}`)
    .join("\n");
}
