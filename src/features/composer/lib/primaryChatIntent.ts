/** Desktop scopes creation to an explicit new-Chat route, never a global navigation preference. */
export function shouldCreatePrimaryChat(input: {
  desktop: boolean; pathname: string; search: string; agentKey: string;
  isNewChatQuery: boolean; primaryNavigation: boolean; hasPrimary: boolean;
}): boolean {
  if (!input.isNewChatQuery) return false;
  if (!input.desktop) return input.primaryNavigation && !input.hasPrimary;
  const params = new URLSearchParams(input.search);
  const nonces = params.getAll("newChat");
  const intents = params.getAll("primaryNewChat");
  return input.pathname === `/agent/${encodeURIComponent(input.agentKey)}` &&
    !params.has("chatId") && nonces.length === 1 && /^[1-9]\d{12}$/.test(nonces[0]) &&
    intents.length === 1 && intents[0] === "true";
}
