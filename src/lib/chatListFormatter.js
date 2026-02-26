function toLocalDateKey(date) {
  return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
}

function pad2(value) {
  return String(value).padStart(2, '0');
}

function formatLocalDate(date) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

function formatLocalTime(date) {
  return `${pad2(date.getHours())}:${pad2(date.getMinutes())}:${pad2(date.getSeconds())}`;
}

export function pickChatAgentLabel(chat) {
  const firstAgentName = String(chat?.firstAgentName || '').trim();
  if (firstAgentName) {
    return firstAgentName;
  }

  const firstAgentKey = String(chat?.firstAgentKey || '').trim();
  if (firstAgentKey) {
    return firstAgentKey;
  }

  return 'n/a';
}

export function formatChatTimeLabel(updatedAt, nowDate = new Date()) {
  if (!updatedAt) {
    return '--';
  }

  const updatedDate = new Date(updatedAt);
  if (Number.isNaN(updatedDate.getTime())) {
    return '--';
  }

  const now = nowDate instanceof Date ? nowDate : new Date(nowDate);
  if (Number.isNaN(now.getTime())) {
    return formatLocalDate(updatedDate);
  }

  return toLocalDateKey(updatedDate) === toLocalDateKey(now)
    ? formatLocalTime(updatedDate)
    : formatLocalDate(updatedDate);
}
