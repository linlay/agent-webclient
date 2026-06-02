import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { getTextCountUpChars, TextCountUp } from "./index";

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
    expect(html).toContain("--from-digit:0");
    expect(html).toContain("--to-digit:1");
    expect(html).toContain("--to-digit:2");
    expect(html).toContain("--digit-duration:1.2s");
    expect(html).toContain("--digit-delay:0.1s");
    expect(html).toContain(">0</span><span");
    expect(html).toContain(">9</span>");
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

  it("calculates digit transitions from the previous text by right alignment", () => {
    expect(getTextCountUpChars("A18", "A12")).toEqual([
      { char: "A", fromDigit: 0, isDigit: false, toDigit: 0 },
      { char: "1", fromDigit: 1, isDigit: true, toDigit: 1 },
      { char: "8", fromDigit: 2, isDigit: true, toDigit: 8 },
    ]);

    expect(getTextCountUpChars("100", "99")).toEqual([
      { char: "1", fromDigit: 0, isDigit: true, toDigit: 1 },
      { char: "0", fromDigit: 9, isDigit: true, toDigit: 0 },
      { char: "0", fromDigit: 9, isDigit: true, toDigit: 0 },
    ]);
  });

  it("keeps non-digit characters as entrances while digits use previous digits", () => {
    expect(getTextCountUpChars("B2", "A9")).toEqual([
      { char: "B", fromDigit: 0, isDigit: false, toDigit: 0 },
      { char: "2", fromDigit: 9, isDigit: true, toDigit: 2 },
    ]);
  });
});
