/** @jest-environment jsdom */

import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { SelectedTextFragmentsPill } from "@/features/selection/components/SelectedTextFragmentsPill";
import { createSelectedTextFragment, notifySelectedTextReferencesAccepted } from "@/features/selection/lib/selectedTextReference";
import { SELECTED_TEXT_REFERENCE_FOCUS_EVENT } from "@/shared/data/desktop/selectedTextLocate";

import { useSelectedTextFragments } from "@/features/selection/hooks/useSelectedTextFragments";

jest.mock("antd", () => ({
  Popover: ({ children, content }: { children: React.ReactNode; content: React.ReactNode }) => React.createElement("div", null, children, content),
}));

jest.mock("@/shared/ui/MaterialIcon", () => ({
  MaterialIcon: ({ name }: { name: string }) =>
    React.createElement("span", { "data-icon": name }),
}));

jest.mock("@/shared/i18n", () => ({
  useI18n: () => ({
    t: (key: string) => key,
  }),
}));

const reactActEnvironment = globalThis as typeof globalThis & {
  IS_REACT_ACT_ENVIRONMENT?: boolean;
};
reactActEnvironment.IS_REACT_ACT_ENVIRONMENT = true;

afterAll(() => {
  delete reactActEnvironment.IS_REACT_ACT_ENVIRONMENT;
});

describe("SelectedTextFragmentsPill DOM interaction", () => {
  it("runs the removal callback from the rendered dismiss button", () => {
    const fragment = createSelectedTextFragment({
      text: "selected text",
      targetId: "message-1",
      sourceKind: "message",
    })!;
    const container = document.createElement("div");
    const root = createRoot(container);
    const onRemove = jest.fn();

    act(() => {
      root.render(React.createElement(SelectedTextFragmentsPill, {
        fragments: [fragment],
        variant: "annotations",
        onRemove,
      }));
    });
    const dismiss = container.querySelector<HTMLButtonElement>(
      ".selected-text-fragments-pill-dismiss",
    );
    expect(dismiss).not.toBeNull();

    act(() => dismiss?.click());

    expect(onRemove).toHaveBeenCalledWith(fragment.reference.id);
    act(() => root.unmount());
  });
});

it("removes only references transferred to the queue and keeps other chats and later drafts", () => {
  const root = createRoot(document.createElement("div"));
  let current!: ReturnType<typeof useSelectedTextFragments>;
  const Harness = ({ chatId }: { chatId: string }) => { current = useSelectedTextFragments(chatId); return null; };
  const first = createSelectedTextFragment({ text: "first", targetId: "message-1", sourceKind: "message" })!;
  const later = createSelectedTextFragment({ text: "later", targetId: "message-2", sourceKind: "message" })!;
  const other = createSelectedTextFragment({ text: "other", targetId: "message-3", sourceKind: "message" })!;
  try {
    act(() => root.render(React.createElement(Harness, { chatId: "chat-a" })));
    act(() => { current.addFragment(first); current.addFragment(later); });
    act(() => root.render(React.createElement(Harness, { chatId: "chat-b" })));
    act(() => { current.addFragment(other); });
    act(() => notifySelectedTextReferencesAccepted([first.reference]));
    expect(current.fragments).toEqual([{ ...other, reference: { ...other.reference, annotationIndex: 1 } }]);
    act(() => root.render(React.createElement(Harness, { chatId: "chat-a" })));
    expect(current.fragments).toEqual([{ ...later, reference: { ...later.reference, annotationIndex: 2 } }]);
  } finally { act(() => root.unmount()); }
});

it("renders fragment copies with their annotations but without an editable input", () => {
  const container = document.createElement("div");
  const root = createRoot(container);
  const fragment = createSelectedTextFragment({text:"quoted passage",targetId:"m1",sourceKind:"message"})!;
  fragment.reference.annotationIndex = 2;
  fragment.reference.annotation = "please simplify";
  try {
    act(() => root.render(React.createElement(SelectedTextFragmentsPill, {
      fragments:[fragment], variant:"annotations", onRemove: jest.fn(),
    })));
    expect(container.querySelector("textarea")).toBeNull();
    expect(container.textContent).toContain("quoted passage");
    expect(container.textContent).toContain("please simplify");
  } finally { act(() => root.unmount()); }
});

it("lays each row out as index, text and a trailing button behind one shared index gutter", () => {
  const container = document.createElement("div");
  const root = createRoot(container);
  const first = createSelectedTextFragment({text:"quoted passage",targetId:"m1",sourceKind:"message"})!;
  first.reference.annotationIndex = 2;
  const second = createSelectedTextFragment({text:"another passage",targetId:"m2",sourceKind:"message"})!;
  second.reference.annotationIndex = 11;
  try {
    act(() => root.render(React.createElement(SelectedTextFragmentsPill, {
      fragments:[first, second], variant:"annotations", onRemove: jest.fn(),
    })));
    const rows = Array.from(container.querySelectorAll<HTMLElement>(".selected-text-fragment-row"));
    expect(rows.map(row => row.children.length)).toEqual([3, 3]);
    // 索引独立成列，两行共用同一套固定宽度样式，位数不同也不会错开文本列。
    expect(rows.map(row => row.children[0].className)).toEqual([
      "selected-text-fragment-index",
      "selected-text-fragment-index",
    ]);
    expect(rows.map(row => row.children[0].textContent)).toEqual(["2.", "11."]);
    expect(rows.map(row => row.children[0].getAttribute("aria-hidden"))).toEqual(["true", "true"]);
    expect(rows[0].children[1].className).toBe("selected-text-fragment-text");
    expect(rows[0].children[1].textContent).toContain("quoted passage");
    expect(rows.map(row => row.children[2].tagName)).toEqual(["BUTTON", "BUTTON"]);
  } finally { act(() => root.unmount()); }
});

it("shows consecutive indices in the quote list once a row is removed", () => {
  const container = document.createElement("div");
  const root = createRoot(container);
  let current!: ReturnType<typeof useSelectedTextFragments>;
  function Harness() {
    current = useSelectedTextFragments("chat-a");
    return React.createElement(SelectedTextFragmentsPill, {
      fragments: current.fragments, variant: "annotations", onRemove: current.removeFragment,
    });
  }
  const add = (text:string) => act(() => { current.addFragment(createSelectedTextFragment({text,targetId:text,sourceKind:"message"})!); });
  const rowIndices = () => Array.from(container.querySelectorAll<HTMLElement>(".selected-text-fragment-row"))
    .map(row => row.children[0].textContent);
  try {
    act(() => root.render(React.createElement(Harness)));
    add("one"); add("two"); add("three");
    expect(rowIndices()).toEqual(["1.", "2.", "3."]);

    act(() => container.querySelector<HTMLButtonElement>(".selected-text-fragment-row > button")!.click());

    expect(rowIndices()).toEqual(["1.", "2."]);
    expect(container.textContent).toContain("three");
  } finally { act(() => root.unmount()); }
});

it("locates the marker of a clicked quote row, falling back to its source node", () => {
  const previousScroll = HTMLElement.prototype.scrollIntoView;
  const scroll = jest.fn();
  HTMLElement.prototype.scrollIntoView = scroll;
  // 划词目标 id 带 kind 前缀，时间线行上是裸 node id，兜底必须自己对齐这两者。
  const fragment = createSelectedTextFragment({text:"quoted passage",targetId:"message:node-7",sourceKind:"message"})!;
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  const source = document.createElement("div");
  source.dataset.nodeId = "node-7";
  document.body.append(source);
  const requested: string[] = [];
  const listener = (event: Event) =>
    requested.push((event as CustomEvent<{referenceId:string}>).detail.referenceId);
  window.addEventListener(SELECTED_TEXT_REFERENCE_FOCUS_EVENT, listener);
  try {
    act(() => root.render(React.createElement(SelectedTextFragmentsPill, {
      fragments:[fragment], variant:"annotations", onRemove: jest.fn(),
    })));
    const row = container.querySelector<HTMLElement>(".selected-text-fragment-row")!;
    expect(row.getAttribute("role")).toBe("button");

    act(() => row.click());
    expect(requested).toEqual([fragment.reference.id]);
    expect(scroll).toHaveBeenCalledWith({ block: "center", inline: "nearest" });

    act(() => row.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })));
    expect(requested).toHaveLength(2);
  } finally {
    window.removeEventListener(SELECTED_TEXT_REFERENCE_FOCUS_EVENT, listener);
    HTMLElement.prototype.scrollIntoView = previousScroll;
    act(() => root.unmount());
    source.remove(); container.remove();
  }
});

it("removes a quote from its row button without locating it", () => {
  const onRemove = jest.fn();
  const fragment = createSelectedTextFragment({text:"quoted passage",targetId:"message-7",sourceKind:"message"})!;
  const container = document.createElement("div");
  const root = createRoot(container);
  const requested: string[] = [];
  const listener = (event: Event) =>
    requested.push((event as CustomEvent<{referenceId:string}>).detail.referenceId);
  window.addEventListener(SELECTED_TEXT_REFERENCE_FOCUS_EVENT, listener);
  try {
    act(() => root.render(React.createElement(SelectedTextFragmentsPill, {
      fragments:[fragment], variant:"annotations", onRemove,
    })));
    const remove = container.querySelector<HTMLButtonElement>(".selected-text-fragment-row > button")!;
    act(() => remove.click());
    act(() => remove.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })));

    expect(onRemove).toHaveBeenCalledWith(fragment.reference.id);
    expect(requested).toEqual([]);
  } finally {
    window.removeEventListener(SELECTED_TEXT_REFERENCE_FOCUS_EVENT, listener);
    act(() => root.unmount()); container.remove();
  }
});

it("isolates annotation numbering by chat and preserves each draft under StrictMode", () => {
  const root = createRoot(document.createElement("div"));
  let current!: ReturnType<typeof useSelectedTextFragments>;
  const Harness = ({ chatId, restored = [] }: {chatId:string; restored?:unknown[]}) => { current = useSelectedTextFragments(chatId, restored); return null; };
  const render = (chatId:string, restored:unknown[] = []) => act(() => root.render(React.createElement(React.StrictMode, null, React.createElement(Harness,{chatId,restored}))));
  const add = (text:string) => act(() => { current.addFragment(createSelectedTextFragment({text,targetId:text,sourceKind:"message"})!); });
  const indices = () => current.references.map(reference => reference.annotationIndex);
  try {
    render("chat-a"); add("first"); add("second");
    expect(indices()).toEqual([1,2]);
    const secondID = current.references[1].id;
    act(() => current.updateAnnotation(secondID,"keep this comment"));
    act(() => current.removeFragment(current.references[0].id));
    render("chat-b"); add("third");
    expect(indices()).toEqual([1]);
    render("chat-a");
    // 删掉第一条后，剩下的引用重新从 1 排，不能留空档。
    expect(indices()).toEqual([1]);
    expect(current.references[0].annotation).toBe("keep this comment");
    add("fourth"); expect(indices()).toEqual([1,2]);
    act(() => { current.references.forEach(reference => current.removeFragment(reference.id)); });
    add("fifth"); expect(indices()).toEqual([1]);
    render("chat-c",[{type:"selection",annotationIndex:7}]); add("restored-next"); expect(indices()).toEqual([8]);
    render(""); add("blank-one"); add("blank-two"); expect(indices()).toEqual([1,2]);
    render("chat-b"); render(""); add("fresh-blank"); expect(indices()).toEqual([1]);
  } finally { act(() => root.unmount()); }
});

it("renumbers the remaining drafts and their markers after a removal", () => {
  const root = createRoot(document.createElement("div"));
  let current!: ReturnType<typeof useSelectedTextFragments>;
  const Harness = ({ chatId, restored = [] }: {chatId:string; restored?:unknown[]}) => { current = useSelectedTextFragments(chatId, restored); return null; };
  const render = (chatId:string, restored:unknown[] = []) => act(() => root.render(React.createElement(Harness,{chatId,restored})));
  const add = (text:string) => act(() => { current.addFragment(createSelectedTextFragment({text,targetId:text,sourceKind:"message"})!); });
  const indices = () => current.references.map(reference => reference.annotationIndex);
  try {
    render("chat-a");
    add("one"); add("two"); add("three");
    expect(indices()).toEqual([1,2,3]);

    // 删中间一条：后一条补位，编号保持连续，正文标记读到的也是同一份编号。
    act(() => current.removeFragment(current.references[1].id));
    expect(current.references.map(reference => reference.text)).toEqual(["one","three"]);
    expect(indices()).toEqual([1,2]);
    add("four");
    expect(indices()).toEqual([1,2,3]);

    // 删光再划词，编号从 1 重新开始。
    act(() => { current.references.forEach(reference => current.removeFragment(reference.id)); });
    add("five");
    expect(indices()).toEqual([1]);

    // 恢复回来的历史引用仍占着原编号，草稿重排接在它们之后，不能撞号。
    render("chat-b", [{type:"selection",annotationIndex:2}]);
    add("six"); add("seven");
    expect(indices()).toEqual([3,4]);
    act(() => current.removeFragment(current.references[0].id));
    expect(indices()).toEqual([3]);
    add("eight");
    expect(indices()).toEqual([3,4]);
  } finally { act(() => root.unmount()); }
});


it("restarts numbering after each completed run while keeping unsent comments", () => {
  const root = createRoot(document.createElement("div"));
  let current!: ReturnType<typeof useSelectedTextFragments>;
  const Harness = ({ run }: { run: string }) => { current = useSelectedTextFragments("chat-a", [], run); return null; };
  const render = (run: string) => act(() => root.render(React.createElement(Harness, { run })));
  const add = (text: string) => act(() => { current.addFragment(createSelectedTextFragment({ text, targetId: text, sourceKind: "message" })!); });
  try {
    render(""); add("first"); add("second");
    act(() => current.removeFragment(current.references[0].id));
    act(() => current.updateAnnotation(current.references[0].id, "keep"));
    render("run-1");
    expect(current.references[0]).toMatchObject({ annotationIndex: 1, annotation: "keep", text: "second" });
    add("third"); expect(current.references.map(ref => ref.annotationIndex)).toEqual([1, 2]);
    act(() => current.references.forEach(ref => current.removeFragment(ref.id)));
    render("run-2"); add("fourth");
    expect(current.references[0].annotationIndex).toBe(1);
    render("run-2"); add("fifth");
    expect(current.references.map(ref => ref.annotationIndex)).toEqual([1, 2]);
  } finally { act(() => root.unmount()); }
});
