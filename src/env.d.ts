export {};

declare global {
  interface Window {
    __AGENT_APP_ACCESS_TOKEN?: string;
  }
}
