/** @jest-environment jsdom */
import { observeHostVisuals } from "./hostVisuals";
import { AGENT_WEBCLIENT_VISUALS_GLOBAL, type AgentWebclientVisualSnapshot, type AgentWebclientVisualBridge } from "@/shared/contracts/generated/agentWebclientBridge";
const state = (revision: number, resourceSet = "12345678-1234-1234-1234-123456789012"): AgentWebclientVisualSnapshot => ({ schemaVersion: "1.1", revision, resourceSet, visuals: { images: { "chat.send": "chat.send" }, styles: {} } });
describe("visual 1.1 host observer", () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => { delete (window as any)[AGENT_WEBCLIENT_VISUALS_GLOBAL]; jest.useRealTimers(); });
  it("keeps the latest subscription when an older read resolves and rejects conflicting revisions", async () => {
    let publish!: (value: AgentWebclientVisualSnapshot | null) => void;
    let resolve!: (value: AgentWebclientVisualSnapshot | null) => void;
    const bridge: AgentWebclientVisualBridge = { version: "1.1", subscribe: callback => { publish = callback; return () => {}; }, getSnapshot: () => new Promise(done => { resolve = done; }), getAsset: async () => null };
    (window as any)[AGENT_WEBCLIENT_VISUALS_GLOBAL] = bridge;
    const changes = jest.fn(), stop = observeHostVisuals(changes);
    await Promise.resolve(); publish(state(2)); resolve(state(1)); await Promise.resolve();
    expect(changes.mock.calls.at(-1)?.[0]).toEqual(state(2));
    publish(state(2, "22345678-1234-1234-1234-123456789012"));
    expect(changes.mock.calls.at(-1)?.[0]).toEqual(state(2));
    stop(); const count = changes.mock.calls.length; publish(state(3)); expect(changes).toHaveBeenCalledTimes(count);
  });
  it("revokes visuals on timeout or bridge disappearance and discovers a late bridge", async () => {
    const changes = jest.fn(), stop = observeHostVisuals(changes);
    (window as any)[AGENT_WEBCLIENT_VISUALS_GLOBAL] = { version: "1.1", subscribe: () => () => {}, getSnapshot: () => new Promise(() => {}), getAsset: async () => null };
    jest.advanceTimersByTime(1000); await Promise.resolve(); jest.advanceTimersByTime(2000);
    expect(changes.mock.calls.at(-1)).toEqual([null, null]);
    delete (window as any)[AGENT_WEBCLIENT_VISUALS_GLOBAL]; jest.advanceTimersByTime(1000);
    expect(changes.mock.calls.at(-1)).toEqual([null, null]); stop();
  });
});
