/** @jest-environment jsdom */

import React, { act } from "react";
import { Simulate } from "react-dom/test-utils";
import { createRoot } from "react-dom/client";
import { SelectedTextFragmentsPill } from "@/features/selection/components/SelectedTextFragmentsPill";
import { createSelectedTextFragment, notifySelectedTextReferencesAccepted } from "@/features/selection/lib/selectedTextReference";

import { useSelectedTextFragments } from "@/features/selection/hooks/useSelectedTextFragments";

jest.mock("antd", () => ({
  Popover: ({ children, content }: { children: React.ReactNode; content: React.ReactNode }) => React.createElement("div", null, children, content),
  Input: { TextArea: ({ autoSize, ...props }: any) => React.createElement("textarea", props) },
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

it("edits an annotation in the quote popover and keeps it in the send snapshot", () => {
  const container = document.createElement("div");
  const root = createRoot(container);
  let current!: ReturnType<typeof useSelectedTextFragments>;
  const fragment = createSelectedTextFragment({text:"quoted passage",targetId:"m1",sourceKind:"message"})!;
  function Harness() {
    current = useSelectedTextFragments("chat-a");
    return React.createElement(SelectedTextFragmentsPill, {
      fragments: current.fragments, variant:"annotations", onAnnotationChange:current.updateAnnotation,
    });
  }
  try {
    act(() => root.render(React.createElement(Harness)));
    act(() => { current.addFragment(fragment); });
    const input = container.querySelector("textarea")!;
    expect(input).not.toBeNull();
    act(() => { input.value = "please simplify"; Simulate.change(input); });
    expect(current.references[0]).toMatchObject({text:"quoted passage",annotation:"please simplify"});
    expect(current.attachments[0].annotation).toBe("please simplify");
    act(() => { input.value = ""; Simulate.change(input); });
    expect(current.references[0]).not.toHaveProperty("annotation");
  } finally { act(() => root.unmount()); }
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
    expect(indices()).toEqual([2]);
    expect(current.references[0].annotation).toBe("keep this comment");
    add("fourth"); expect(indices()).toEqual([2,3]);
    act(() => { current.references.forEach(reference => current.removeFragment(reference.id)); });
    add("fifth"); expect(indices()).toEqual([4]);
    render("chat-c",[{type:"selection",annotationIndex:7}]); add("restored-next"); expect(indices()).toEqual([8]);
    render(""); add("blank-one"); add("blank-two"); expect(indices()).toEqual([1,2]);
    render("chat-b"); render(""); add("fresh-blank"); expect(indices()).toEqual([1]);
  } finally { act(() => root.unmount()); }
});
