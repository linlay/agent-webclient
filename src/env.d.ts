export {};

declare global {
  var __AGENT_WEBCLIENT_RUNTIME_CONFIG__: Record<string, unknown> | undefined;

  interface Window {
    __AGENT_APP_ACCESS_TOKEN?: string;
    __ZENMIND_DESKTOP_WEBVIEW_BRIDGE__?: boolean;
  }
}
