import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { TextCountUp } from "./index";

jest.mock("./index.module.css", () => ({
  Char: "Char",
  Digit: "Digit",
  DigitList: "DigitList",
  DigitValue: "DigitValue",
  TextCountUp: "TextCountUp",
}));

describe("TextCountUp", () => {
  it("renders digits as count-up columns and keeps the final text accessible", () => {
    const html = renderToStaticMarkup(
      React.createElement(TextCountUp, {
        text: "A12",
        duration: 1.2,
        delayStep: 0.1,
      }),
    );

    expect(html).toContain('aria-label="A12"');
    expect(html).toContain('class="Char"');
    expect(html).toContain('class="Digit"');
    expect(html).toContain("--digit:1");
    expect(html).toContain("--digit:2");
    expect(html).toContain("--digit-duration:1.2s");
    expect(html).toContain("--digit-delay:0.1s");
    expect(html).toContain(">0</span><span");
    expect(html).toContain(">2</span>");
  });

  it("passes through className and clamps negative animation settings", () => {
    const html = renderToStaticMarkup(
      React.createElement(TextCountUp, {
        text: "9%",
        className: "metric",
        duration: -1,
        delayStep: -1,
      }),
    );

    expect(html).toContain('class="TextCountUp metric"');
    expect(html).toContain("--digit-duration:0s");
    expect(html).toContain("--digit-delay:0s");
    expect(html).toContain("animation-delay:0s");
  });
});
