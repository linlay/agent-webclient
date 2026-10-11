import { getEChartsHeight, parseEChartsOption } from "./MarkdownECharts";

describe("parseEChartsOption", () => {
  it("accepts a strict JSON object", () => {
    expect(parseEChartsOption('{"series":[{"type":"bar","data":[1,2]}]}')).toEqual({
      series: [{ type: "bar", data: [1, 2] }],
    });
  });

  it("rejects JavaScript expressions without executing them", () => {
    const marker = jest.fn();
    (globalThis as typeof globalThis & { __echartsMarker?: () => void }).__echartsMarker = marker;

    expect(() =>
      parseEChartsOption('({"series":[]}, globalThis.__echartsMarker())'),
    ).toThrow();
    expect(marker).not.toHaveBeenCalled();

    delete (globalThis as typeof globalThis & { __echartsMarker?: () => void }).__echartsMarker;
  });

  it("rejects empty values and non-object JSON", () => {
    expect(() => parseEChartsOption(" ")).toThrow("empty");
    expect(() => parseEChartsOption("[]")).toThrow("JSON object");
    expect(() => parseEChartsOption("null")).toThrow("JSON object");
  });

  it("uses the chart's requested height or grid extent without a maximum", () => {
    expect(getEChartsHeight(parseEChartsOption('{"height":1800}'))).toBe(1800);
    expect(getEChartsHeight({ grid: { top: 40, height: 1400, bottom: 80 } })).toBe(1520);
    expect(getEChartsHeight({ series: [] })).toBe(320);
    expect(getEChartsHeight(parseEChartsOption('{"height":-1}'))).toBe(320);
  });
});
