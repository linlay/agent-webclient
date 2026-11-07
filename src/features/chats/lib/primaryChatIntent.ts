export function supportsPrimaryChat(mode: string | undefined): boolean {
  return String(mode || "").trim().toUpperCase() === "BOT";
}

/** Desktop scopes creation to an explicit new-Chat route, never a global navigation preference. */
export function shouldCreatePrimaryChat(input: {
  desktop: boolean; pathname: string; search: string; agentKey: string; agentMode?: string;
  isNewChatQuery: boolean; primaryNavigation: boolean; hasPrimary: boolean;
}): boolean {
  // /api/send resolves or creates the BOT main Chat atomically. Clients never
  // publish or replace the pointer through a query creation flag.
  return false;
}
