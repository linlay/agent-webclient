/** @jest-environment jsdom */
import {
  locateSelectedTextReference,
  SELECTED_TEXT_REFERENCE_FOCUS_EVENT,
  SELECTED_TEXT_TARGET_REVEAL_EVENT,
  type SelectedTextReferenceFocusDetail,
  type SelectedTextTargetRevealDetail,
} from "@/shared/data/desktop/selectedTextLocate";
import { rememberSelectedTextAnchor } from "@/shared/data/desktop/selectedTextAnchors";

const QUOTE = "quoted passage";
const frames: FrameRequestCallback[] = [];
const previousRaf = Object.getOwnPropertyDescriptor(window, "requestAnimationFrame");

beforeAll(() => {
  // 折叠面板展开是异步的，重试挂在 rAF 上；由用例自己推进帧。
  Object.defineProperty(window, "requestAnimationFrame", {
    configurable: true,
    value: (callback: FrameRequestCallback) => {
      frames.push(callback);
      return frames.length;
    },
  });
});

afterAll(() => {
  if (previousRaf) Object.defineProperty(window, "requestAnimationFrame", previousRaf);
  else delete (window as unknown as { requestAnimationFrame?: unknown }).requestAnimationFrame;
  document.body.replaceChildren();
});

beforeEach(() => {
  frames.length = 0;
});

function flushFrame() {
  const next = frames.shift();
  if (!next) return false;
  next(0);
  return true;
}

function listen<T>(type: string, onDetail: (detail: T) => void) {
  const listener = (event: Event) => onDetail((event as CustomEvent<T>).detail);
  window.addEventListener(type, listener);
  return () => window.removeEventListener(type, listener);
}

/** 一棵带 data-node-id 的时间线行，并在其中登记一条引用。 */
function seedRow(nodeId: string, referenceId: string) {
  const row = document.createElement("div");
  row.setAttribute("data-node-id", nodeId);
  const paragraph = document.createElement("p");
  paragraph.textContent = QUOTE;
  row.append(paragraph);
  document.body.append(row);
  const range = document.createRange();
  range.selectNodeContents(paragraph);
  rememberSelectedTextAnchor(referenceId, range, QUOTE);
  return row;
}

it("stops at the annotation surface as long as it can still draw the marker", () => {
  const row = seedRow("node-7", "selection-a");
  const focused: string[] = [];
  const reveals: string[] = [];
  const offFocus = listen<SelectedTextReferenceFocusDetail>(SELECTED_TEXT_REFERENCE_FOCUS_EVENT, (detail) => {
    focused.push(detail.referenceId);
    detail.handled = true;
  });
  const offReveal = listen<SelectedTextTargetRevealDetail>(SELECTED_TEXT_TARGET_REVEAL_EVENT, (detail) => {
    reveals.push(detail.nodeId);
  });
  try {
    locateSelectedTextReference("selection-a", "message:node-7");

    expect(focused).toEqual(["selection-a"]);
    // 标记已经点亮，不必惊动折叠面板，也没有必要排重试。
    expect(reveals).toEqual([]);
    expect(frames).toHaveLength(0);

    // 没有引用就没有请求，更不会去展开任何面板。
    locateSelectedTextReference("", "message:node-7");
    expect(focused).toHaveLength(1);
    expect(reveals).toEqual([]);
  } finally {
    offFocus();
    offReveal();
    row.remove();
  }
});

it("keeps asking through the layout settle window so the last request lands on the settled row", () => {
  const row = seedRow("node-9", "selection-b");
  const reveals: string[] = [];
  const focused: string[] = [];
  const offReveal = listen<SelectedTextTargetRevealDetail>(SELECTED_TEXT_TARGET_REVEAL_EVENT, (detail) => {
    reveals.push(detail.nodeId);
    detail.handled = true;
  });
  // 面板展开要花几帧，标记只能在它落定之后才回来。
  let attempts = 0;
  const offFocus = listen<SelectedTextReferenceFocusDetail>(SELECTED_TEXT_REFERENCE_FOCUS_EVENT, (detail) => {
    focused.push(detail.referenceId);
    attempts += 1;
    if (attempts >= 3) detail.handled = true;
  });
  try {
    locateSelectedTextReference("selection-b", "message:node-9");

    // 锚点自己记着它落在哪一行，所以命名空间前缀不需要猜。
    expect(reveals).toEqual(["node-9"]);
    expect(focused).toHaveLength(1);
    expect(frames).toHaveLength(1);

    // 标记在第 3 帧就回来了，但此刻量到的还是收起的行高：定位窗口不会提前收手。
    flushFrame();
    flushFrame();
    expect(focused).toHaveLength(3);
    expect(frames).toHaveLength(1);

    let flushes = 2;
    while (flushFrame()) flushes += 1;
    // 窗口末尾那次请求才是按最终行高发出的，也是最后认领定位的那一次。
    expect(flushes).toBe(36);
    // 每次请求都换回一次尝试（外加开头那次探测）。
    expect(focused).toHaveLength(flushes + 1);
    // 认领成功就说明滚到了标记处，不必再惊动折叠面板，也没有兜底滚动。
    expect(reveals).toEqual(["node-9"]);
  } finally {
    offReveal();
    offFocus();
    row.remove();
  }
});

it("reasks the timeline for the row and finally scrolls the source row when the marker never returns", () => {
  const row = seedRow("node-10", "selection-e");
  const scroll = jest.fn();
  row.scrollIntoView = scroll;
  const reveals: string[] = [];
  const focused: string[] = [];
  const offReveal = listen<SelectedTextTargetRevealDetail>(SELECTED_TEXT_TARGET_REVEAL_EVENT, (detail) => {
    reveals.push(detail.nodeId);
    detail.handled = true;
  });
  const offFocus = listen<SelectedTextReferenceFocusDetail>(SELECTED_TEXT_REFERENCE_FOCUS_EVENT, (detail) => {
    focused.push(detail.referenceId);
  });
  try {
    locateSelectedTextReference("selection-e", "message:node-10");

    let flushes = 0;
    while (flushFrame() && flushes < 500) flushes += 1;

    // 有界：三个窗口（每个 36 帧）之后不再排帧，每个已排的帧都换回一次尝试。
    expect(flushes).toBe(108);
    expect(focused).toHaveLength(flushes + 1);
    // 每轮都按当时的行高重下一次滚动；一个窗口画不出来，就让时间线再滚一次。
    expect(reveals).toEqual(["node-10", "node-10", "node-10"]);
    // 怎么也画不出来时退回滚原文行，至少让它所在的那一行出现在视口里。
    expect(scroll).toHaveBeenCalledWith({ block: "center", inline: "nearest" });
  } finally {
    offReveal();
    offFocus();
    row.remove();
  }
});

it("lets the newest request take over when another quote is located in between", () => {
  const row = seedRow("node-12", "selection-d");
  const nextRow = seedRow("node-13", "selection-f");
  const focused: string[] = [];
  const offReveal = listen<SelectedTextTargetRevealDetail>(SELECTED_TEXT_TARGET_REVEAL_EVENT, (detail) => {
    detail.handled = true;
  });
  const offFocus = listen<SelectedTextReferenceFocusDetail>(SELECTED_TEXT_REFERENCE_FOCUS_EVENT, (detail) => {
    focused.push(detail.referenceId);
  });
  try {
    locateSelectedTextReference("selection-d", "message:node-12");
    flushFrame();
    expect(focused).toEqual(["selection-d", "selection-d"]);

    // 第一条还在展开窗口里，用户就点了另一条：旧窗口必须让位。
    locateSelectedTextReference("selection-f", "message:node-13");
    for (let index = 0; index < 5; index += 1) flushFrame();

    expect(focused.filter((id) => id === "selection-d")).toHaveLength(2);
    expect(focused[focused.length - 1]).toBe("selection-f");
    expect(frames.length).toBeGreaterThan(0);
  } finally {
    offReveal();
    offFocus();
    row.remove();
    nextRow.remove();
  }
});

it("falls back to scrolling the source row when the timeline does not know it", () => {
  const row = seedRow("node-11", "selection-c");
  const scroll = jest.fn();
  row.scrollIntoView = scroll;
  try {
    locateSelectedTextReference("selection-c", "message:node-11");

    expect(scroll).toHaveBeenCalledWith({ block: "center", inline: "nearest" });
    expect(frames).toHaveLength(0);
  } finally {
    row.remove();
  }
});
