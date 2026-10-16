/** @jest-environment jsdom */

import { readConversationStyleNonce } from "./styleNonce";

afterEach(() => document.head.replaceChildren());

it("reads the response nonce without generating or changing it", () => {
  const nonce = "aB3_-".repeat(8) + "abc";
  const meta = document.createElement("meta");
  meta.name = "conversation-export-style-nonce";
  meta.content = nonce;
  document.head.append(meta);
  expect(readConversationStyleNonce()).toBe(nonce);
  expect(meta.content).toBe(nonce);
});

it.each([
  undefined,
  "",
  "__CONVERSATION_EXPORT_STYLE_NONCE__",
  "a".repeat(42),
  "a".repeat(44),
  '" onload="bad',
])(
  "fails closed for a missing or invalid nonce: %s",
  (nonce) => {
    if (nonce !== undefined) {
      const meta = document.createElement("meta");
      meta.name = "conversation-export-style-nonce";
      meta.content = nonce;
      document.head.append(meta);
    }
    expect(readConversationStyleNonce).toThrow("conversation_export_style_nonce_invalid");
  },
);
