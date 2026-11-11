import type { OpenBTWOptions } from "./btwTypes";

export type BtwLaunch = Omit<OpenBTWOptions, "parentChatId" | "sendImmediately">;

type LaunchMessage =
  | { type: "offer" | "ready"; id: string }
  | { type: "launch"; id: string; options: BtwLaunch }
  | { type: "result"; id: string; accepted: boolean };

function openChannel(chatId: string, target: string) {
  return new BroadcastChannel(`agent-webclient:btw-launch:${JSON.stringify([chatId, target])}`);
}

export function sendBtwLaunch(chatId: string, target: string, options: BtwLaunch): Promise<boolean> {
  const id = crypto.randomUUID();
  const channel = openChannel(chatId, target);
  return new Promise((resolve, reject) => {
    let sent = false;
    const close = () => {
      clearInterval(offerTimer);
      clearTimeout(timeout);
      channel.close();
    };
    const offer = () => channel.postMessage({ type: "offer", id } satisfies LaunchMessage);
    const offerTimer = setInterval(offer, 200);
    const timeout = setTimeout(() => {
      close();
      resolve(false);
    }, 10_000);
    channel.onmessage = (event: MessageEvent<LaunchMessage>) => {
      const message = event.data;
      if (message?.id !== id) return;
      if (message.type === "ready" && !sent) {
        sent = true;
        clearInterval(offerTimer);
        try {
          channel.postMessage({ type: "launch", id, options } satisfies LaunchMessage);
        } catch (error) {
          close();
          reject(error);
        }
      } else if (message.type === "result" && sent) {
        close();
        resolve(message.accepted === true);
      }
    };
    offer();
  });
}

// Wait for the guest to load its Chat owner and deliver the payload once.
export function receiveBtwLaunches(
  chatId: string,
  target: string,
  input: {
    isReady: () => boolean;
    accept: (options: BtwLaunch) => boolean;
  },
): () => void {
  let channel: BroadcastChannel;
  try {
    channel = openChannel(chatId, target);
  } catch {
    return () => undefined;
  }
  channel.onmessage = (event: MessageEvent<LaunchMessage>) => {
    const message = event.data;
    if (typeof message?.id !== "string") return;
    if (message.type === "offer" && input.isReady()) {
      channel.postMessage({ type: "ready", id: message.id } satisfies LaunchMessage);
    } else if (message.type === "launch") {
      const accepted = input.isReady() && Boolean(message.options) && input.accept(message.options);
      channel.postMessage({ type: "result", id: message.id, accepted } satisfies LaunchMessage);
    }
  };
  return () => channel.close();
}
