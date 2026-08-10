import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AddMenuTrigger } from "@/features/composer/components/ComposerAddMenu";

jest.mock("@/shared/i18n", () => ({
  useI18n: () => ({ t: (key: string) => key }),
}));

jest.mock("@/shared/ui/UiButton", () => ({
  UiButton: ({
    children,
    "aria-label": ariaLabel,
    ...rest
  }: Record<string, unknown>) =>
    React.createElement(
      "button",
      { "aria-label": ariaLabel, ...rest },
      children,
    ),
}));

jest.mock("@/shared/ui/MaterialIcon", () => ({
  MaterialIcon: ({ name }: { name: string }) =>
    React.createElement("span", { "data-icon": name }),
}));

describe("AddMenuTrigger", () => {
  it("renders a plus button", () => {
    const html = renderToStaticMarkup(
      React.createElement(AddMenuTrigger, {
        disabled: false,
        loading: false,
        onClick: jest.fn(),
      }),
    );

    expect(html).toContain("composer.addMenu.open");
    expect(html).toContain("add");
  });
});
