import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  removeAllSelectedTextFragments,
  SelectedTextFragmentsPill,
} from "@/features/selection/components/SelectedTextFragmentsPill";
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
    t: (key: string, values?: { count?: number }) =>
      values?.count === undefined ? key : `${key}:${values.count}`,
  }),
}));

const fragments = [
  createSelectedTextFragment({
    text: "first",
    targetId: "message-1",
    sourceKind: "message",
  })!,
  createSelectedTextFragment({
    text: "second",
    targetId: "message-2",
    sourceKind: "message",
  })!,
];

describe("SelectedTextFragmentsPill", () => {
  it("shows one hover/focus dismiss action only for Composer annotations", () => {
    const annotations = renderToStaticMarkup(
      React.createElement(SelectedTextFragmentsPill, {
        fragments,
        variant: "annotations",
        onRemove: jest.fn(),
      }),
    );
    const segments = renderToStaticMarkup(
      React.createElement(SelectedTextFragmentsPill, {
        fragments,
        variant: "segments",
        onRemove: jest.fn(),
      }),
    );

    expect(annotations).toContain("selected-text-fragments-pill-wrap");
    expect(annotations).toContain("selected-text-fragments-pill-dismiss");
    expect(annotations).toContain('aria-label="selection.fragment.removeAnnotations"');
    expect(segments).not.toContain("selected-text-fragments-pill-dismiss");
  });

  it("removes every fragment represented by the aggregate annotation pill", () => {
    const onRemove = jest.fn();

    removeAllSelectedTextFragments(fragments, onRemove);

    expect(onRemove.mock.calls).toEqual([
      [fragments[0].reference.id],
      [fragments[1].reference.id],
    ]);
  });

});
