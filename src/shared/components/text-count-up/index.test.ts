import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { getTextCountUpChars, TextCountUp } from "./index";

jest.mock("./index.module.css", () => ({
  Char: "Char",
  CharStatic: "CharStatic",
  DigitList: "DigitList",
  DigitListStatic: "DigitListStatic",
}));

describe("TextCountUp", () => {
  function withoutGeneratedKeys(
    chars: ReturnType<typeof getTextCountUpChars>,
  ) {
    return chars.map(({ key: _key, ...char }) => char);
  }

  it("renders digits as static columns on first render and keeps final text accessible", () => {
    const html = renderToStaticMarkup(
      React.createElement(TextCountUp, {
        text: "A12",
        duration: 1.2,
        delayStep: 0.1,
      }),
    );

    expect(html).toContain('aria-label="A12"');
    // 首次渲染无 prevText，非数字字符用 CharStatic
    expect(html).toContain('class="CharStatic tw:inline-block"');
    expect(html).toContain(
      'class="tw:inline-block tw:h-[1em] tw:overflow-hidden tw:leading-none tw:align-baseline"',
    );
    expect(html).toContain("--from-digit:0");
    expect(html).toContain("--to-digit:1");
    expect(html).toContain("--to-digit:2");
    // 首次渲染数字用 DigitListStatic（无动画）
    expect(html).toContain('class="DigitListStatic');
    expect(html).toContain(">0</span><span");
    expect(html).toContain(">9</span>");
    expect(html).toContain(">2</span>");
  });

  it("passes through className and uses static rendering on first mount", () => {
    const html = renderToStaticMarkup(
      React.createElement(TextCountUp, {
        text: "9%",
        className: "metric",
        duration: -1,
        delayStep: -1,
      }),
    );

    expect(html).toContain(
      'class="tw:inline-flex tw:items-baseline tw:whitespace-pre tw:[font-variant-numeric:tabular-nums] metric"',
    );
    // 首次渲染无动画：数字用 DigitListStatic
    expect(html).toContain('class="DigitListStatic');
  });

  it("calculates digit transitions from the previous text by right alignment", () => {
    expect(withoutGeneratedKeys(getTextCountUpChars("A18", "A12"))).toEqual([
      { char: "A", fromDigit: 0, isDigit: false, toDigit: 0, changed: false },
      { char: "1", fromDigit: 1, isDigit: true, toDigit: 1, changed: false },
      { char: "8", fromDigit: 2, isDigit: true, toDigit: 8, changed: true },
    ]);

    expect(withoutGeneratedKeys(getTextCountUpChars("100", "99"))).toEqual([
      { char: "1", fromDigit: 0, isDigit: true, toDigit: 1, changed: true },
      { char: "0", fromDigit: 9, isDigit: true, toDigit: 0, changed: true },
      { char: "0", fromDigit: 9, isDigit: true, toDigit: 0, changed: true },
    ]);
  });

  it("keeps non-digit characters as entrances while digits use previous digits", () => {
    expect(withoutGeneratedKeys(getTextCountUpChars("B2", "A9"))).toEqual([
      { char: "B", fromDigit: 0, isDigit: false, toDigit: 0, changed: true },
      { char: "2", fromDigit: 9, isDigit: true, toDigit: 2, changed: true },
    ]);
  });

  it("marks unchanged digits as changed=false when text is identical", () => {
    expect(withoutGeneratedKeys(getTextCountUpChars("1.2K", "1.2K"))).toEqual([
      { char: "1", fromDigit: 1, isDigit: true, toDigit: 1, changed: false },
      { char: ".", fromDigit: 0, isDigit: false, toDigit: 0, changed: false },
      { char: "2", fromDigit: 2, isDigit: true, toDigit: 2, changed: false },
      { char: "K", fromDigit: 0, isDigit: false, toDigit: 0, changed: false },
    ]);
  });

  it("marks only the changed digit when a single digit changes", () => {
    expect(withoutGeneratedKeys(getTextCountUpChars("1.3K", "1.2K"))).toEqual([
      { char: "1", fromDigit: 1, isDigit: true, toDigit: 1, changed: false },
      { char: ".", fromDigit: 0, isDigit: false, toDigit: 0, changed: false },
      { char: "3", fromDigit: 2, isDigit: true, toDigit: 3, changed: true },
      { char: "K", fromDigit: 0, isDigit: false, toDigit: 0, changed: false },
    ]);
  });

  it("marks all chars as unchanged on first render without previous text", () => {
    expect(withoutGeneratedKeys(getTextCountUpChars("A1", undefined))).toEqual([
      { char: "A", fromDigit: 0, isDigit: false, toDigit: 0, changed: false },
      { char: "1", fromDigit: 0, isDigit: true, toDigit: 1, changed: false },
    ]);
  });
});
