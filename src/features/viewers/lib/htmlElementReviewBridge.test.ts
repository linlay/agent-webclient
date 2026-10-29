/** @jest-environment jsdom */
import {
  HTML_ELEMENT_REVIEW_ACTION,
  HTML_ELEMENT_REVIEW_EVENT,
  buildHtmlElementReviewScript,
} from "./htmlElementReview";

type BridgeMessage = {
  type: string;
  token: string;
  payload: Record<string, unknown>;
};

function nextFrame() {
  return new Promise<void>((resolve) => window.setTimeout(resolve, 20));
}

describe("HTML element review bridge", () => {
  const originalRaf = window.requestAnimationFrame;

  beforeAll(() => {
    if (typeof window.requestAnimationFrame !== "function") {
      (window as unknown as { requestAnimationFrame: (callback: FrameRequestCallback) => number })
        .requestAnimationFrame = (callback) => window.setTimeout(() => callback(0), 0);
    }
  });

  afterAll(() => {
    window.requestAnimationFrame = originalRaf;
  });

  function boot() {
    document.head.innerHTML = "";
    document.body.innerHTML = "<main><h2>季度营收概览</h2><button>跳转</button></main>";
    const heading = document.querySelector("h2")!;
    Object.defineProperty(heading, "getBoundingClientRect", {
      configurable: true,
      value: () => ({
        left: 10,
        top: 20,
        right: 210,
        bottom: 60,
        width: 200,
        height: 40,
      }),
    });
    (document as unknown as {
      elementsFromPoint: (x: number, y: number) => Element[];
    }).elementsFromPoint = () => [heading];

    const messages: BridgeMessage[] = [];
    const parent = window as unknown as { postMessage: (data: BridgeMessage) => void };
    parent.postMessage = (data: BridgeMessage) => messages.push(data);
    const token = "bridge-token";
    const script = buildHtmlElementReviewScript(token);
    expect(() => new Function("parent", script)(parent)).not.toThrow();
    return { heading, messages, parent, token };
  }

  function action(
    target: { parent: unknown; token: string },
    input: Partial<{ enabled: boolean; locked: boolean; annotations: unknown[] }> = {},
  ) {
    window.dispatchEvent(new MessageEvent("message", {
      data: {
        type: HTML_ELEMENT_REVIEW_ACTION,
        token: target.token,
        enabled: input.enabled ?? false,
        locked: input.locked ?? false,
        annotations: input.annotations ?? [],
      },
      source: window,
    }));
  }

  function pointer(type: "pointerdown" | "pointerup" | "pointermove", x = 10, y = 10) {
    const event = new MouseEvent(type, {
      bubbles: true,
      cancelable: true,
      clientX: x,
      clientY: y,
      button: 0,
    });
    Object.defineProperty(event, "pointerType", { value: "mouse" });
    document.querySelector("h2")!.dispatchEvent(event);
    return event;
  }

  it("redacts sensitive text excerpts before sending them to the host", () => {
    const bridge = boot();
    document.querySelector("h2")!.textContent = "Bearer abc.def token=secret https://example.com/a";
    action(bridge, { enabled: true });
    pointer("pointerdown");
    pointer("pointerup");
    const selected = bridge.messages.find((message) => message.payload.event === "html-element-selected");
    expect(selected?.payload.textExcerpt).toBe("Bearer [redacted] token=[redacted] [url]");
    action(bridge, { enabled: false });
  });

  it("reports ready and emits a normalized element selection", () => {
    const bridge = boot();
    action(bridge);
    expect(bridge.messages.map((message) => message.payload.event)).toContain("ready");

    action(bridge, { enabled: true });
    pointer("pointerdown");
    pointer("pointerup");

    const selected = bridge.messages.find((message) => message.payload.event === "html-element-selected");
    expect(selected).toBeDefined();
    expect(selected?.payload.fullXPath).toBe("/html/body/main/h2");
    expect(selected?.payload.tagName).toBe("h2");
    expect(selected?.payload.textExcerpt).toBe("季度营收概览");
    expect(selected?.payload.rect).toEqual({ x: 10, y: 20, width: 200, height: 40 });
    action(bridge, { enabled: false });
  });

  it("draws numbered markers and reports missing targets", async () => {
    const bridge = boot();
    action(bridge, { enabled: true, annotations: [{
      id: "a1",
      number: 1,
      fullXPath: "/html/body/main/h2",
    }] });
    await nextFrame();

    const overlay = document.getElementById("__agent_webclient_html_review_overlay__");
    expect(overlay?.children).toHaveLength(1);
    expect(overlay?.textContent).toContain("1");

    action(bridge, { enabled: true, annotations: [{
      id: "a2",
      number: 2,
      fullXPath: "/html/body/main/missing",
    }] });
    await nextFrame();
    const invalid = bridge.messages.find((message) => message.payload.event === "annotation-invalid");
    expect(invalid?.payload.annotationId).toBe("a2");
    expect(invalid?.payload.reason).toBe("xpath_unresolved");
    action(bridge, { enabled: false });
  });

  it("does not emit selections while locked by a pending annotation", () => {
    const bridge = boot();
    action(bridge, { enabled: true, locked: true });
    pointer("pointerdown");
    pointer("pointerup");
    expect(bridge.messages.some((message) => message.payload.event === "html-element-selected")).toBe(false);
    action(bridge, { enabled: false });
  });

  it("forwards Escape so the host can leave annotation mode", () => {
    const bridge = boot();
    action(bridge, { enabled: true });
    document.querySelector("h2")!.dispatchEvent(new KeyboardEvent("keydown", {
      key: "Escape",
      bubbles: true,
      cancelable: true,
    }));
    expect(bridge.messages.some((message) => message.payload.event === "escape")).toBe(true);
    action(bridge, { enabled: false });
  });

  it("clears the overlay when annotation mode ends", async () => {
    const bridge = boot();
    action(bridge, { enabled: true, annotations: [{
      id: "a1",
      number: 1,
      fullXPath: "/html/body/main/h2",
    }] });
    await nextFrame();
    const overlay = document.getElementById("__agent_webclient_html_review_overlay__");
    expect(overlay?.children.length).toBeGreaterThan(0);

    action(bridge, { enabled: false });
    await nextFrame();
    expect(overlay?.children).toHaveLength(0);
  });
});
