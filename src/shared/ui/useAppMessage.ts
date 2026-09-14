import { App, message as staticMessage } from "antd";
import type { MessageInstance } from "antd/es/message/interface";

type AppMessageProvider = { useApp?: () => { message?: MessageInstance } } | undefined;

/**
 * 返回最近 <App> 提供的主题感知 message 实例；脱离 Provider（如单测）时回退到静态 message。
 */
export function useAppMessage(): MessageInstance {
  const app = App as unknown as AppMessageProvider;
  const message = app?.useApp?.()?.message;
  return message && typeof message.success === "function" ? message : staticMessage;
}
