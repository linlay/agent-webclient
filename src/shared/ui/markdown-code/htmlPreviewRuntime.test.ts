import { cacheHtmlPreview, getCachedHtmlPreview, HTML_PREVIEW_LIMIT, prioritizeHtmlPreviewSlot, requestHtmlPreviewSlot } from "./htmlPreviewRuntime";

it("limits active previews and admits the next waiting preview when a slot is released", () => {
  const statuses = Array.from({ length: HTML_PREVIEW_LIMIT + 1 }, () => jest.fn());
  const release = statuses.map((notify, index) => requestHtmlPreviewSlot(`test-${index}`, notify));
  try {
    expect(statuses[0]).toHaveBeenLastCalledWith("active");
    expect(statuses[HTML_PREVIEW_LIMIT]).toHaveBeenLastCalledWith("queued");
    release[0]();
    expect(statuses[HTML_PREVIEW_LIMIT]).toHaveBeenLastCalledWith("active");
  } finally { release.forEach(dispose => dispose()); }
});

it("lets a queued request replace an active request while retaining the limit", () => {
  const statuses = Array.from({ length: HTML_PREVIEW_LIMIT + 1 }, () => jest.fn());
  const release = statuses.map((notify, index) => requestHtmlPreviewSlot(`priority-${index}`, notify));
  try {
    prioritizeHtmlPreviewSlot(`priority-${HTML_PREVIEW_LIMIT}`);
    expect(statuses[HTML_PREVIEW_LIMIT]).toHaveBeenLastCalledWith("active");
    expect(statuses.filter(notify => notify.mock.calls.at(-1)?.[0] === "active")).toHaveLength(HTML_PREVIEW_LIMIT);
  } finally { release.forEach(dispose => dispose()); }
});

it("keeps full content height and navigation blocking for remounts", () => {
  cacheHtmlPreview("stopped-document", { height: 420, blocked: true });
  cacheHtmlPreview("stopped-document:768", { height: 5000 });
  expect(getCachedHtmlPreview("stopped-document")).toEqual({ height: 420, blocked: true });
  expect(getCachedHtmlPreview("stopped-document:768").height).toBe(5000);
  expect(getCachedHtmlPreview("stopped-document:1024", "stopped-document").height).toBe(420);
});
