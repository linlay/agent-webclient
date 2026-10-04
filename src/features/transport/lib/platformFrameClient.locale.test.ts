import { PlatformFrameClient } from "./platformFrameClient";
import type { AgentPlatformRequestFrame } from "@/shared/contracts/generated/agentWebclientBridge";
import { configureI18nRuntime, getI18nRuntimeConfig } from "@/shared/i18n/runtime";

class Client extends PlatformFrameClient {
  frames: AgentPlatformRequestFrame[] = [];
  constructor() { super(); }
  async connect() {}
  getStatus() { return "open" as const; }
  protected sendRequestFrame(frame: AgentPlatformRequestFrame) {
    this.frames.push(frame);
    if (frame.type === "/api/chat" || frame.type === "/api/locale") this.dispatchPlatformFrame({ frame: "response", id: frame.id, type: frame.type, code: 0, msg: "success", data: {} });
  }
}

const original = getI18nRuntimeConfig();
afterEach(() => configureI18nRuntime(original));

test("business requests and streams do not inject locale", async () => {
  const client = new Client();
  configureI18nRuntime({ locale: "zh-CN" });
  await client.request({ type: "/api/chat", payload: { chatId: "chat" } });
  const query = client.stream({ type: "/api/query", payload: { message: "hello" }, onEvent: () => undefined });
  await Promise.resolve();
  configureI18nRuntime({ locale: "en-US" });
  const attach = client.stream({ type: "/api/attach", payload: { runId: "run" }, onEvent: () => undefined });
  await Promise.resolve();
  expect(client.frames.map(frame => frame.payload)).toEqual([{ chatId: "chat" }, { message: "hello" }, { runId: "run" }]);
  query.abort(); attach.abort();
});


test("locale endpoint retains explicit getter and setter semantics", async () => {
  const client = new Client();
  configureI18nRuntime({ locale: "zh-CN" });
  await client.request({ type: "/api/locale", payload: {} });
  expect(client.frames[0].payload).toEqual({});
  await client.request({ type: "/api/locale", payload: { locale: "en-US" } });
  expect(client.frames[1].payload).toEqual({ locale: "en-US" });
});
