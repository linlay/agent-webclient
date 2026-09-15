import { firstChatAgent, resourceAssistantUrl, resourceComposerPrefill } from "./resourceAssistant";
import { zhCNMessages } from "@/shared/i18n/locales/zh-CN";
const t = (key: string, values: Record<string, unknown> = {}) => String((zhCNMessages as Record<string, string>)[key] || key).replace(/\{(\w+)\}/g, (_, name) => String(values[name] ?? ""));

describe("resource assistant URL", () => {
  it.each(["automation", "skill", "agent", "connector", "registry"] as const)("prefills %s without sending or binding a chat", kind => {
    const url = new URL(resourceAssistantUrl("default chat", resourceComposerPrefill({ kind }, t)), "https://test.invalid");
    expect(url.pathname).toBe("/agent/default%20chat");
    expect([...url.searchParams.keys()].sort()).toEqual(["composerDraft", "composerSkill", "newChat"]);
    expect(url.searchParams.get("composerSkill")).toBe(kind === "automation" ? "platform-automation" : "platform-admin");
    expect(url.searchParams.get("newChat")).toMatch(/^[1-9]\d{12}$/);
    expect(url.searchParams.get("composerDraft")).toContain("……");
  });
  it("preserves target identity and category as draft text, including URL metacharacters", () => {
    const prefill = resourceComposerPrefill({ kind: "registry", category: "models", target: { id: "a & b?#.yml", name: "中文模型" } }, t);
    const url = new URL(resourceAssistantUrl("assistant", prefill), "https://test.invalid");
    expect(url.searchParams.get("composerDraft")).toBe(prefill.composerDraft);
    expect(prefill.composerDraft).toContain("a & b?#.yml");
    expect(prefill.composerDraft).toContain("models");
    expect(url.hash).toBe("");
  });
  it("mints distinct new chat identities for repeated clicks in the same millisecond", () => {
    const prefill = resourceComposerPrefill({ kind: "agent" }, t);
    expect(resourceAssistantUrl("chat", prefill, 1790000000000)).not.toBe(resourceAssistantUrl("chat", prefill, 1790000000000));
  });
  it("rejects missing edit identity and oversized drafts", () => {
    expect(() => resourceComposerPrefill({ kind: "skill", target: { id: " " } }, t)).toThrow();
    expect(() => resourceComposerPrefill({ kind: "skill", target: { id: "x".repeat(2049) } }, t)).toThrow();
  });
  it("selects a navigable ordinary Agent rather than a Team or Coder", () => {
    expect(firstChatAgent([{ key: "team", kind: "team" }, { key: "coder", mode: "CODER" }, { key: "chat", mode: "REACT" }])).toBe("chat");
    expect(firstChatAgent([])).toBe("");
  });
});
