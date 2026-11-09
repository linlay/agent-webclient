import { webcrypto, createHash } from "node:crypto";
import { buildHtmlDraftPreview } from "./htmlDraftPreview";

beforeAll(() => { Object.defineProperty(globalThis, "crypto", { configurable: true, value: webcrypto }); });
test("preserves HTML bytes and derives a deterministic content identity", async () => {
  const html = "  <h1>旅行</h1>\n";
  const result = await buildHtmlDraftPreview(html, { agentKey: "agent", chatId: "chat" });
  expect(result).toMatchObject({ ok: true, source: { html, sha256: createHash("sha256").update(html).digest("hex") } });
  expect(await buildHtmlDraftPreview(html, { agentKey: "agent", chatId: "chat" })).toEqual(result);
});
test("limits UTF-8 bytes rather than character count and requires the Markdown owner's Chat", async () => {
  expect(await buildHtmlDraftPreview("中".repeat(1_400_000), { agentKey: "agent", chatId: "chat" })).toEqual({ ok: false, reason: "too-large" });
  expect(await buildHtmlDraftPreview("<h1>x</h1>", { agentKey: "agent", chatId: "" })).toEqual({ ok: false, reason: "invalid-context" });
});
