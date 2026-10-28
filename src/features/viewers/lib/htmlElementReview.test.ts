import {
  HTML_ELEMENT_REVIEW_MAX,
  buildHtmlElementReviewDocument,
  buildHtmlElementReviewPayload,
  buildHtmlElementReviewScript,
  buildHtmlElementReviewText,
  createInitialHtmlElementReviewState,
  htmlElementReviewReducer,
  normalizeHtmlElementSelection,
  sanitizeHtmlElementText,
  submittableHtmlElementAnnotations,
  type HtmlElementReviewAnnotation,
  type HtmlElementReviewState,
} from "./htmlElementReview";

function selection(overrides: Record<string, unknown> = {}) {
  return {
    fullXPath: "/html/body/main/h2",
    cssSelector: "main > h2",
    tagName: "h2",
    attributes: { role: "heading", "aria-label": "标题" },
    textExcerpt: "季度营收概览",
    rect: { x: 120, y: 340, width: 480, height: 40 },
    ...overrides,
  };
}

function annotation(overrides: Partial<HtmlElementReviewAnnotation> = {}): HtmlElementReviewAnnotation {
  return {
    id: "annotation-1",
    number: 1,
    fullXPath: "/html/body/main/h2",
    cssSelector: "main > h2",
    tagName: "h2",
    attributes: { role: "heading" },
    textExcerpt: "季度营收概览",
    rect: { x: 120, y: 340, width: 480, height: 40 },
    requirement: "标题太长，缩到 12 字以内",
    ...overrides,
  };
}

function stateWith(annotations: HtmlElementReviewAnnotation[]): HtmlElementReviewState {
  return {
    ...createInitialHtmlElementReviewState(),
    annotating: true,
    annotations,
    invalidIds: [],
  };
}

describe("html element review", () => {
  it("redacts sensitive excerpts and collapses whitespace", () => {
    expect(sanitizeHtmlElementText(
      "Bearer abc.def  token=secret  https://example.com/a  12345678901234567890123456789012  多个   空格",
    )).toBe("Bearer [redacted] token=[redacted] [url] [redacted] 多个 空格");
    expect(sanitizeHtmlElementText("a".repeat(500), 10)).toHaveLength(10);
  });

  it("normalizes a bridge selection and rejects unsafe geometry", () => {
    expect(normalizeHtmlElementSelection(selection())).toEqual({
      fullXPath: "/html/body/main/h2",
      cssSelector: "main > h2",
      tagName: "h2",
      attributes: { role: "heading", "aria-label": "标题" },
      textExcerpt: "季度营收概览",
      rect: { x: 120, y: 340, width: 480, height: 40 },
    });
    expect(normalizeHtmlElementSelection(selection({ fullXPath: "html/body" }))).toBeNull();
    expect(normalizeHtmlElementSelection(selection({ rect: { x: 0, y: 0, width: 0, height: 10 } }))).toBeNull();
    expect(normalizeHtmlElementSelection(selection({ rect: { x: -1, y: 0, width: 10, height: 10 } }))).toBeNull();
    expect(normalizeHtmlElementSelection(null)).toBeNull();
  });

  it("drops non-whitelisted attributes and sanitizes excerpts", () => {
    const normalized = normalizeHtmlElementSelection(selection({
      attributes: { role: "button", onclick: "evil()", name: "token=abc" },
      textExcerpt: "secret=abc",
    }));
    expect(normalized?.attributes).toEqual({ role: "button", name: "token=[redacted]" });
    expect(normalized?.textExcerpt).toBe("secret=[redacted]");
  });

  it("runs the annotation state machine and renumbers after deletion", () => {
    let state = createInitialHtmlElementReviewState();
    state = htmlElementReviewReducer(state, { type: "START" });
    expect(state.annotating).toBe(true);

    const first = normalizeHtmlElementSelection(selection())!;
    state = htmlElementReviewReducer(state, { type: "SET_LIST", open: true });
    expect(state.listOpen).toBe(true);
    state = htmlElementReviewReducer(state, { type: "SELECT", selection: first });
    expect(state.listOpen).toBe(false);
    expect(state.pending?.selection.fullXPath).toBe("/html/body/main/h2");
    state = htmlElementReviewReducer(state, { type: "SELECT", selection: first });
    expect(state.annotations).toHaveLength(0);

    state = htmlElementReviewReducer(state, { type: "CONFIRM_PENDING", id: "a1" });
    expect(state.annotations).toHaveLength(0);
    state = htmlElementReviewReducer(state, { type: "PENDING_REQUIREMENT", value: "改成 12 字" });
    state = htmlElementReviewReducer(state, { type: "CONFIRM_PENDING", id: "a1" });
    expect(state.annotations).toEqual([expect.objectContaining({ id: "a1", number: 1, requirement: "改成 12 字" })]);
    expect(state.listOpen).toBe(false);

    state = htmlElementReviewReducer(state, { type: "START" });
    state = htmlElementReviewReducer(state, { type: "SELECT", selection: first });
    state = htmlElementReviewReducer(state, { type: "PENDING_REQUIREMENT", value: "第二条" });
    state = htmlElementReviewReducer(state, { type: "CONFIRM_PENDING", id: "a2" });
    expect(state.annotations.map((item) => item.number)).toEqual([1, 2]);

    state = htmlElementReviewReducer(state, { type: "REMOVE", id: "a1" });
    expect(state.annotations).toEqual([expect.objectContaining({ id: "a2", number: 1 })]);

    state = htmlElementReviewReducer(state, { type: "STOP" });
    expect(state.annotating).toBe(false);
    expect(state.listOpen).toBe(false);
    expect(state.annotations).toHaveLength(1);
  });

  it("marks missing targets and excludes them from handoff", () => {
    let state = stateWith([
      annotation({ id: "a1", number: 1 }),
      annotation({ id: "a2", number: 2, requirement: "第二条要求" }),
    ]);
    state = htmlElementReviewReducer(state, { type: "INVALIDATE", id: "a1" });
    expect(state.invalidIds).toEqual(["a1"]);

    const submittable = submittableHtmlElementAnnotations(state.annotations, state.invalidIds);
    expect(submittable).toHaveLength(1);
    expect(submittable[0].id).toBe("a2");

    const payload = buildHtmlElementReviewPayload({
      fileName: "/tmp/secret/report.html",
      revision: "rev-1",
      annotations: state.annotations,
      invalidIds: state.invalidIds,
    });
    expect(payload?.annotations).toHaveLength(1);
    expect(payload?.annotations[0].id).toBe("a2");
    expect(payload?.annotations[0].requirement).toBe("第二条要求");
    expect(payload?.document).toEqual({ fileName: "report.html", revision: "rev-1" });

    state = htmlElementReviewReducer(state, { type: "VALIDATE", id: "a1" });
    expect(state.invalidIds).toEqual([]);
  });

  it("builds a handoff payload with only submittable annotations", () => {
    const annotations = [
      annotation({ id: "a1", number: 1 }),
      annotation({ id: "a2", number: 2, requirement: "   " }),
      annotation({ id: "a3", number: 3, fullXPath: "/html/body/main/button" }),
    ];
    const payload = buildHtmlElementReviewPayload({
      fileName: "report.html",
      revision: "",
      annotations,
      invalidIds: ["a3"],
    });
    expect(payload?.version).toBe(1);
    expect(payload?.kind).toBe("html-element");
    expect(payload?.document.revision).toBe("");
    expect(payload?.annotations.map((item) => item.id)).toEqual(["a1"]);
    expect(payload?.annotations[0].requirement).toBe("标题太长，缩到 12 字以内");

    const text = buildHtmlElementReviewText({
      fileName: "report.html",
      annotations,
      invalidIds: ["a3"],
    });
    expect(text).toContain("report.html");
    expect(text).toContain("/html/body/main/h2");
    expect(text).toContain("标题太长，缩到 12 字以内");
    expect(text).not.toContain("/html/body/main/button");
    expect(text.split("\n").at(-1)).toContain("只修改");
  });

  it("caps the number of annotations in the payload", () => {
    const annotations = Array.from({ length: HTML_ELEMENT_REVIEW_MAX + 3 }, (_, index) =>
      annotation({ id: `a${index}`, number: index + 1 }));
    const payload = buildHtmlElementReviewPayload({
      fileName: "report.html",
      revision: "r",
      annotations,
      invalidIds: [],
    });
    expect(payload?.annotations).toHaveLength(HTML_ELEMENT_REVIEW_MAX);
  });

  it("injects the bridge before the document CSP meta", () => {
    const source = "<!doctype html><html><head><meta http-equiv=\"Content-Security-Policy\" content=\"default-src 'self'\"></head><body><main>Dashboard</main></body></html>";
    const result = buildHtmlElementReviewDocument(source, "token-1");
    expect(result.indexOf("token-1")).toBeGreaterThan(-1);
    expect(result.indexOf("token-1")).toBeLessThan(result.indexOf("Content-Security-Policy"));
    expect(result.indexOf("token-1")).toBeLessThan(result.indexOf("<main>"));
  });

  it("creates a head when the document does not have one", () => {
    const result = buildHtmlElementReviewDocument("<main>Only body</main>", "token-2");
    expect(result.startsWith("<!doctype html><html><head>")).toBe(true);
    expect(result).toContain("<body><main>Only body</main></body>");
  });

  it("ships the interaction and rendering hooks in the bridge", () => {
    const script = buildHtmlElementReviewScript("token-3");
    expect(() => new Function(script)).not.toThrow();
    expect(script).toContain("elementsFromPoint");
    expect(script).toContain("requestAnimationFrame");
    expect(script).toContain("selectstart");
    expect(script).toContain("MutationObserver");
    expect(script).toContain("annotation-invalid");
    expect(script).toContain("token-3");
    expect(script).not.toContain("requirement");
  });
});
