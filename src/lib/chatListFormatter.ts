function toLocalDateKey(date: Date): string {
  return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
}

function pad2(value: number): string {
  return String(value).padStart(2, '0');
}

function formatLocalTime(date: Date): string {
  return `${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
}

function formatMonthDay(date: Date): string {
  return `${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

function formatYearMonth(date: Date): string {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}`;
}

export interface ChatInfo {
  firstAgentName?: string;
  firstAgentKey?: string;
  agentKey?: string;
  chatName?: string;
  chatId?: string;
  updatedAt?: string | number | Date;
}

function findAgentNameByKey(agents: Array<{ key?: string; name?: string }>, candidateKey: string): string {
  const normalizedKey = String(candidateKey || '').trim();
  if (!normalizedKey) return '';
  const matched = Array.isArray(agents)
    ? agents.find((agent) => String(agent?.key || '').trim() === normalizedKey)
    : null;
  return String(matched?.name || '').trim();
}

export function pickChatAgentLabel(chat: ChatInfo, agents: Array<{ key?: string; name?: string }> = []): string {
  const firstAgentName = String(chat?.firstAgentName || '').trim();
  if (firstAgentName) {
    return firstAgentName;
  }

  const firstAgentKey = String(chat?.firstAgentKey || '').trim();
  const fallbackAgentKey = String(chat?.agentKey || '').trim();
  const candidateKey = firstAgentKey || fallbackAgentKey;
  const mappedAgentName = findAgentNameByKey(agents, candidateKey);
  if (mappedAgentName) {
    return mappedAgentName;
  }

  if (candidateKey) {
    return candidateKey;
  }

  return 'n/a';
}

export function formatChatTimeLabel(updatedAt: string | number | Date | undefined, nowDate: Date = new Date()): string {
  if (!updatedAt) {
    return '--';
  }

  const updatedDate = new Date(updatedAt);
  if (Number.isNaN(updatedDate.getTime())) {
    return '--';
  }

  const now = nowDate instanceof Date ? nowDate : new Date(nowDate);
  if (Number.isNaN(now.getTime())) {
    return formatYearMonth(updatedDate);
  }

  // 今天：显示 HH:mm
  if (toLocalDateKey(updatedDate) === toLocalDateKey(now)) {
    return formatLocalTime(updatedDate);
  }

  // 今年但不是今天：显示 MM-dd
  if (updatedDate.getFullYear() === now.getFullYear()) {
    return formatMonthDay(updatedDate);
  }

  // 跨年：显示 YYYY-MM
  return formatYearMonth(updatedDate);
}
