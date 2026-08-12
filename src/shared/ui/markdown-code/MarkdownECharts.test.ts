import { parseEChartsOption } from "./MarkdownECharts";

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
});
