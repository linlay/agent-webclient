export function safeText(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value === null || value === undefined) return '';
  if (typeof value === 'object') {
    try {
      return JSON.stringify(value);
    } catch {
      return '';
    }
  }
  return String(value);
}

export function toText(value: unknown): string {
  return String(value || '').trim();
}

export function isTerminalStatus(status?: string): boolean {
  const value = String(status || '').trim().toLowerCase();
  return value === 'completed' || value === 'failed' || value === 'canceled' || value === 'cancelled';
}
