/** @jest-environment jsdom */

import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { SelectedTextFragmentsPill } from "@/features/selection/components/SelectedTextFragmentsPill";
import { createSelectedTextFragment } from "@/features/selection/lib/selectedTextReference";

jest.mock("antd", () => ({
  Popover: ({ children }: { children: React.ReactNode }) => children,
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
