import type {
  AgentWebclientRealtimeMessage,
} from "@/features/transport/contracts/generated/agentWebclientBridge";
import { AGENT_WEBCLIENT_BRIDGE_VERSION } from "@/features/transport/contracts/generated/agentWebclientBridge";
import type {
  PushFilter,
  PushFrame,
  PushTransport,
} from "@/features/transport/contracts/realtimeTransport";
import { fromDesktopBridgeError } from "@/features/transport/contracts/realtimeTransportErrors";
import { DesktopBridgeSession } from "@/features/transport/lib/desktopBridge";

const EARLY_PUSH_LIMIT = 256;

type PushMessage = Extract<AgentWebclientRealtimeMessage, { kind: "push" }>;

type PushContext = {
  filter: PushFilter;
  listener: (frame: PushFrame) => void;
  active: boolean;
  subscriptionId: string;
};

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function field(data: unknown, key: "chatId" | "runId" | "agentKey"): string {
  const root = record(data);
  const nested = Object.keys(record(root.payload)).length
    ? record(root.payload)
    : record(root.data);
  return String(root[key] ?? nested[key] ?? "").trim();
}

function matches(filter: PushFilter, message: PushMessage): boolean {
  const types = new Set(filter.types.map((value) => String(value || "").trim()).filter(Boolean));
  if (types.size > 0 && !types.has(message.type)) return false;
  if (filter.chatId && field(message.data, "chatId") !== filter.chatId) return false;
  if (filter.runId && field(message.data, "runId") !== filter.runId) return false;
  if (filter.agentKey && field(message.data, "agentKey") !== filter.agentKey) return false;
  return true;
}

export class DesktopPushTransport implements PushTransport {
  private readonly contexts = new Map<string, PushContext>();
  private readonly pending = new Set<PushContext>();
  private readonly earlyPushes = new Map<string, PushMessage[]>();
  private earlyPushCount = 0;
  private readonly removeMessageListener: () => void;
  private disposed = false;

  constructor(private readonly session: DesktopBridgeSession) {
    this.removeMessageListener = session.subscribeMessages((message) => {
      if (message.kind === "push") this.handlePush(message);
      if (message.kind === "error" && message.delivery.kind === "subscription") {
        const subscriptionId = message.delivery.subscriptionId;
        const context = this.contexts.get(subscriptionId);
        if (context) {
          context.active = false;
          this.contexts.delete(subscriptionId);
          void fromDesktopBridgeError(message.error);
        }
      }
    });
  }

  private handlePush(message: PushMessage): void {
    const context = this.contexts.get(message.subscriptionId);
    if (!context) {
      if (this.earlyPushCount >= EARLY_PUSH_LIMIT) {
        for (const pending of this.pending) pending.active = false;
        this.earlyPushes.clear();
        this.earlyPushCount = 0;
        return;
      }
      const pushes = this.earlyPushes.get(message.subscriptionId) || [];
      pushes.push(message);
      this.earlyPushes.set(message.subscriptionId, pushes);
      this.earlyPushCount += 1;
      return;
    }
    if (!context.active || !matches(context.filter, message)) return;
    context.listener({
      frame: "push",
      type: message.type,
      data: message.data,
    });
  }

  private drainEarly(context: PushContext): void {
    const pushes = this.earlyPushes.get(context.subscriptionId) || [];
    this.earlyPushes.delete(context.subscriptionId);
    this.earlyPushCount = Math.max(0, this.earlyPushCount - pushes.length);
    for (const push of pushes) this.handlePush(push);
  }

  subscribe(
    filter: PushFilter,
    listener: (frame: PushFrame) => void,
  ): () => void {
    const context: PushContext = {
      filter: {
        ...filter,
        types: filter.types.map((type) => String(type || "").trim()).filter(Boolean),
      },
      listener,
      active: !this.disposed,
      subscriptionId: "",
    };
    this.pending.add(context);
    if (context.active) {
      void this.session.requireCapability("push.subscribe")
        .then(() => this.session.realtime.subscribe({
          version: AGENT_WEBCLIENT_BRIDGE_VERSION,
          kind: "push",
          types: context.filter.types,
          filter: {
            ...(context.filter.chatId ? { chatId: context.filter.chatId } : {}),
            ...(context.filter.runId ? { runId: context.filter.runId } : {}),
          },
        }))
        .then(async (result) => {
          this.pending.delete(context);
          if (!result.ok) throw fromDesktopBridgeError(result.error);
          const subscriptionId = String(result.subscriptionId || "").trim();
          if (!subscriptionId) return;
          context.subscriptionId = subscriptionId;
          if (!context.active || this.disposed) {
            await this.session.realtime.detach({
              version: AGENT_WEBCLIENT_BRIDGE_VERSION,
              target: { kind: "subscription", subscriptionId },
            });
            return;
          }
          this.contexts.set(subscriptionId, context);
          this.drainEarly(context);
        })
        .catch(() => {
          this.pending.delete(context);
          context.active = false;
        });
    }

    return () => {
      if (!context.active) return;
      context.active = false;
      this.pending.delete(context);
      if (context.subscriptionId) {
        this.contexts.delete(context.subscriptionId);
        void this.session.realtime.detach({
          version: AGENT_WEBCLIENT_BRIDGE_VERSION,
          target: { kind: "subscription", subscriptionId: context.subscriptionId },
        });
      }
    };
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.removeMessageListener();
    for (const context of this.pending) context.active = false;
    for (const [subscriptionId, context] of this.contexts) {
      context.active = false;
      void this.session.realtime.detach({
        version: AGENT_WEBCLIENT_BRIDGE_VERSION,
        target: { kind: "subscription", subscriptionId },
      });
    }
    this.pending.clear();
    this.contexts.clear();
    this.earlyPushes.clear();
    this.earlyPushCount = 0;
  }
}
