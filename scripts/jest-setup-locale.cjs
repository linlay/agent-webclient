// Node 21+ exposes a global navigator whose language follows the host OS locale.
// i18n falls back to it when no provider or stored locale exists, so pin it to the
// project default (zh-CN) to keep assertions independent of the machine running
// the tests. jsdom environments keep their own fixed navigator.
if (typeof window === "undefined" && typeof navigator === "object" && navigator) {
  Object.defineProperty(navigator, "language", { value: "zh-CN", configurable: true });
  Object.defineProperty(navigator, "languages", { value: Object.freeze(["zh-CN"]), configurable: true });
}
