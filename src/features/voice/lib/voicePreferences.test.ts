/** @jest-environment jsdom */
import { readVoiceMode, saveVoiceMode, voicePreferenceScope } from "./voicePreferences";
import { readVoiceShortcut, saveVoiceShortcut } from "./voicePreferences";
import { defaultVoiceShortcut } from "./voiceShortcut";
import { getBackendMode } from "@/shared/config/backendMode";
import { getGatewaySession } from "@/shared/data/auth/gatewaySession";
jest.mock("@/shared/config/backendMode", () => ({ getBackendMode: jest.fn(() => "platform") }));
jest.mock("@/shared/data/auth/gatewaySession", () => ({ getGatewaySession: jest.fn() }));
const jwt = (sub: string, exp: number, iss = "issuer") => `header.${btoa(JSON.stringify({ sub, iss, exp }))}.signature`;
beforeEach(() => { localStorage.clear(); delete window.__AGENT_APP_AUTH_CONTEXT; jest.mocked(getBackendMode).mockReturnValue("platform"); jest.mocked(getGatewaySession).mockReturnValue(null); });

it("defaults to button, remembers the account across JWT refresh and isolates other accounts/issuers", () => {
  const token = jwt("alice", 1), scope = voicePreferenceScope(token);
  expect(readVoiceMode(scope)).toBe("button"); saveVoiceMode(scope, "duplex");
  expect(readVoiceMode(voicePreferenceScope(jwt("alice", 2)))).toBe("duplex");
  expect(readVoiceMode(voicePreferenceScope(jwt("bob", 1)))).toBe("button");
  expect(readVoiceMode(voicePreferenceScope(jwt("alice", 1, "other")))).toBe("button");
  expect(JSON.stringify(localStorage)).not.toContain(token);
});

it("reuses Desktop backend/account context and isolates gateway identities", () => {
  window.__AGENT_APP_AUTH_CONTEXT = "desktop-server-a:user-a";
  saveVoiceMode(voicePreferenceScope("old-token"), "duplex");
  expect(readVoiceMode(voicePreferenceScope("new-token"))).toBe("duplex");
  window.__AGENT_APP_AUTH_CONTEXT = "desktop-server-b:user-a";
  expect(readVoiceMode(voicePreferenceScope("new-token"))).toBe("button");
  jest.mocked(getBackendMode).mockReturnValue("gateway");
  const gateway = (subject: string) => ({ user: { subject } }) as ReturnType<typeof getGatewaySession>;
  jest.mocked(getGatewaySession).mockReturnValue(gateway("alice")); saveVoiceMode(voicePreferenceScope(""), "duplex");
  jest.mocked(getGatewaySession).mockReturnValue(gateway("bob")); expect(readVoiceMode(voicePreferenceScope(""))).toBe("button");
});

it("tolerates corrupt or inaccessible storage without persisting credentials", () => {
  const scope = voicePreferenceScope("opaque-token");
  expect(scope).not.toContain("opaque-token");
  const get = jest.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("denied"); });
  const set = jest.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("denied"); });
  expect(readVoiceMode(scope)).toBe("button"); expect(() => saveVoiceMode(scope, "duplex")).not.toThrow();
  get.mockRestore(); set.mockRestore();
});

it("distinguishes default, disabled and custom shortcuts and isolates identities", () => {
  const scope = voicePreferenceScope(jwt("alice", 1));
  expect(readVoiceShortcut(scope).shortcut).toEqual(defaultVoiceShortcut());
  expect(saveVoiceShortcut(scope, null)).toBe(true);
  expect(readVoiceShortcut(scope).shortcut).toBeNull();
  const custom = { ...defaultVoiceShortcut(), code: "F13", ctrlKey: false, metaKey: false, shiftKey: false };
  expect(saveVoiceShortcut(scope, custom)).toBe(true);
  expect(readVoiceShortcut(voicePreferenceScope(jwt("alice", 2))).shortcut).toEqual(custom);
  expect(readVoiceShortcut(voicePreferenceScope(jwt("bob", 1))).shortcut).toEqual(defaultVoiceShortcut());
  localStorage.setItem(`agent-webclient.voice-shortcut.v1:${scope}`, '{"code":"Space"}');
  expect(readVoiceShortcut(scope)).toEqual({ shortcut: null, shortcutError: "voice.shortcut.invalidStorage" });
});

it("reports failed shortcut persistence", () => {
  const set = jest.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("denied"); });
  try { expect(saveVoiceShortcut("scope", defaultVoiceShortcut())).toBe(false); }
  finally { set.mockRestore(); }
});
