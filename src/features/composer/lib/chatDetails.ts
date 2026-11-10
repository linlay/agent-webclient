/** Reload idle history with detailed events using the existing Platform API. */
export function reloadChatDetails(chatId: string): void {
  window.dispatchEvent(new CustomEvent("agent:load-chat", {
    detail: { chatId, forceReload: true, focusComposerOnComplete: false, detail: "detailed" },
  }));
}
