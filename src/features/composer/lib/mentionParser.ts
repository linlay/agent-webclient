const LEADING_MENTION_REGEX = /^\s*@([^\s]+)\s*/;
const LEADING_DRAFT_REGEX = /^\s*@([^\s]*)$/;
const EMPTY_MENTION_REGEX = /^\s*@\s*$/;

export interface AgentInfo {
  key: string;
  name: string;
}

function normalizeAgents(agents: unknown[]): AgentInfo[] {
  if (!Array.isArray(agents)) {
    return [];
  }

  return agents
    .map((item) => {
      const obj = item as Record<string, unknown>;
      return {
        key: String(obj?.key || '').trim(),
        name: String(obj?.name || '').trim(),
      };
    })
    .filter((item) => item.key);
}

export interface MentionDraft {
  token: string;
}

export function parseLeadingMentionDraft(message: string): MentionDraft | null {
  const raw = String(message ?? '');
  const match = raw.match(LEADING_DRAFT_REGEX);

  if (!match) {
    return null;
  }

  return {
    token: match[1] || '',
  };
}

export interface MentionResult {
  cleanMessage: string;
  mentionAgentKey: string;
  mentionToken: string;
  error: string;
  hasMention: boolean;
}

export function parseLeadingAgentMention(message: string, agents: unknown[]): MentionResult {
  const raw = String(message ?? '');
  const trimmed = raw.trim();

  if (EMPTY_MENTION_REGEX.test(raw)) {
    return {
      cleanMessage: '',
      mentionAgentKey: '',
      mentionToken: '',
      error: 'agent mention is empty',
      hasMention: true,
    };
  }

  const match = raw.match(LEADING_MENTION_REGEX);
  if (!match) {
    return {
      cleanMessage: trimmed,
      mentionAgentKey: '',
      mentionToken: '',
      error: '',
      hasMention: false,
    };
  }

  const mentionToken = match[1];
  const cleanMessage = raw.slice(match[0].length).trim();
  const knownAgents = normalizeAgents(agents);
  const loweredToken = mentionToken.toLowerCase();
  const found = knownAgents.find((item) => item.key === mentionToken)
    || knownAgents.find((item) => item.name === mentionToken)
    || knownAgents.find((item) => item.key.toLowerCase() === loweredToken)
    || knownAgents.find((item) => item.name.toLowerCase() === loweredToken);

  if (!found) {
    return {
      cleanMessage: trimmed,
      mentionAgentKey: '',
      mentionToken,
      error: `unknown agent: ${mentionToken}`,
      hasMention: true,
    };
  }

  return {
    cleanMessage,
    mentionAgentKey: found.key,
    mentionToken,
    error: '',
    hasMention: true,
  };
}
