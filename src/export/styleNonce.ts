export function readConversationStyleNonce(): string {
  const nonce = document.querySelector<HTMLMetaElement>(
    'meta[name="conversation-export-style-nonce"]',
  )?.content;
  if (!nonce || !/^[A-Za-z0-9_-]{43}$/u.test(nonce)) {
    throw new Error("conversation_export_style_nonce_invalid");
  }
  return nonce;
}
