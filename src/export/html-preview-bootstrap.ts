import { prepareShareHtml, type ShareHtmlPayload } from "./shareHtmlDocument";

const shareOrigin = document.querySelector<HTMLMetaElement>('meta[name="conversation-share-origin"]')?.content;
if (shareOrigin && window.parent !== window) {
  const connect = (event: MessageEvent) => {
    if (event.source !== window.parent || event.origin !== shareOrigin ||
      event.data?.type !== "conversation-html-connect") return;
    window.removeEventListener("message", connect);
    const channel = new MessageChannel();
    channel.port1.onmessage = (delivery: MessageEvent<ShareHtmlPayload>) => {
      channel.port1.onmessage = null;
      channel.port1.close();
      const urls: string[] = [];
      try {
        const html = prepareShareHtml(delivery.data, (blob) => {
          const url = URL.createObjectURL(blob);
          urls.push(url);
          return url;
        });
        // Retain this network Document's HTTP CSP and opaque sandbox origin.
        document.open();
        document.write(html);
        document.close();
        window.addEventListener("pagehide", () => urls.forEach((url) => URL.revokeObjectURL(url)), { once: true });
      } catch {
        urls.forEach((url) => URL.revokeObjectURL(url));
        document.body.textContent = delivery.data.unavailable;
      }
    };
    window.parent.postMessage({ type: "conversation-html-ready" }, shareOrigin, [channel.port2]);
  };
  window.addEventListener("message", connect);
}
