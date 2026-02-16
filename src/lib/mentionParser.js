const LEADING_MENTION_REGEX = /^\s*@([^\s]+)\s*/;
const LEADING_DRAFT_REGEX = /^\s*@([^\s]*)$/;
const EMPTY_MENTION_REGEX = /^\s*@\s*$/;

function normalizeAgents(agents) {
  if (!Array.isArray(agents)) {
    return [];
  }

  return agents
    .map((item) => ({
      key: String(item?.key || '').trim(),
      name: String(item?.name || '').trim()
    }))
    .filter((item) => item.key);
}

export function parseLeadingMentionDraft(message) {
  const raw = String(message ?? '');
  const match = raw.match(LEADING_DRAFT_REGEX);

  if (!match) {
    return null;
  }

  return {
    token: match[1] || ''
  };
}

export function parseLeadingAgentMention(message, agents) {
  const raw = String(message ?? '');
  const trimmed = raw.trim();

  if (EMPTY_MENTION_REGEX.test(raw)) {
    return {
      cleanMessage: '',
      mentionAgentKey: '',
      mentionToken: '',
      error: 'agent mention is empty',
      hasMention: true
    };
  }

  const match = raw.match(LEADING_MENTION_REGEX);
  if (!match) {
    return {
      cleanMessage: trimmed,
      mentionAgentKey: '',
      mentionToken: '',
      error: '',
      hasMention: false
    };
  }

  const mentionToken = match[1];
  const cleanMessage = raw.slice(match[0].length).trim();
  const knownAgents = normalizeAgents(agents);
  const found = knownAgents.find((item) => item.key === mentionToken);

  if (!found) {
    return {
      cleanMessage: trimmed,
      mentionAgentKey: '',
      mentionToken,
      error: `unknown agent: ${mentionToken}`,
      hasMention: true
    };
  }

  return {
    cleanMessage,
    mentionAgentKey: found.key,
    mentionToken,
    error: '',
    hasMention: true
  };
}
