import { shouldCreatePrimaryChat } from "./primaryChatIntent";
const base = { desktop: true, pathname: "/agent/a", search: "?newChat=1793000000000&primaryNewChat=true", agentKey: "a", isNewChatQuery: true, primaryNavigation: false, hasPrimary: false };
it("carries the explicit intent on an initial query, including upload placeholder Chats", () => {
  expect(shouldCreatePrimaryChat(base)).toBe(true);
});
it.each([
  { search: "?newChat=1793000000000" , primaryNavigation: true },
  { search: "?newChat=1793000000000&primaryNewChat=true&chatId=old" },
  { search: "?primaryNewChat=true" },
  { search: "?newChat=1793000000000&primaryNewChat=true&primaryNewChat=true" },
  { search: "?newChat=bad&primaryNewChat=true" },
  { isNewChatQuery: false },
  { pathname: "/copilot/a" },
  { pathname: "/btw/a" },
  { agentKey: "other" },
])("keeps ordinary routes and other owners out of primary creation: %j", patch => {
  expect(shouldCreatePrimaryChat({ ...base, ...patch })).toBe(false);
});
it("keeps standalone mode behavior and ignores Desktop route flags there", () => {
  expect(shouldCreatePrimaryChat({ ...base, desktop: false })).toBe(false);
  expect(shouldCreatePrimaryChat({ ...base, desktop: false, primaryNavigation: true })).toBe(true);
  expect(shouldCreatePrimaryChat({ ...base, desktop: false, primaryNavigation: true, hasPrimary: true })).toBe(false);
});
