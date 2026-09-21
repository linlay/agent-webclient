/** @jest-environment jsdom */
import {
  rememberSelectedTextAnchor,
  revealSelectedTextAnchor,
  selectedTextAnchorRects,
} from "@/shared/data/desktop/selectedTextAnchors";

const QUOTE = "quoted passage";
const RECT = { left: 100, top: 200, right: 260, bottom: 224, width: 160, height: 24 };
const previousRects = Object.getOwnPropertyDescriptor(Range.prototype, "getClientRects");

beforeAll(() => {
  // 让矩形本身带上断言：只有重建出来的 range 真的覆盖这段引用时才返回矩形
  //（按折叠空白比较，覆盖 markdown 重排把换行换回空格的情形）。
  Object.defineProperty(Range.prototype, "getClientRects", {
    configurable: true,
    value: function (this: Range) {
      return this.toString().replace(/\s+/g, " ").trim() === QUOTE ? [RECT] : [];
    },
  });
});

afterAll(() => {
  if (previousRects) Object.defineProperty(Range.prototype, "getClientRects", previousRects);
  else delete (Range.prototype as unknown as { getClientRects?: unknown }).getClientRects;
  document.body.replaceChildren();
});

/** MutationObserver 在微任务里推进 DOM 版本号，DOM 变过之后要给重定位一次机会。 */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

type Row = { row: HTMLDivElement; paragraph: HTMLParagraphElement; end: number };

/** 一棵带 data-node-id 的时间线行，正文是 `${lead}${QUOTE}${trail}`。 */
function renderRow(nodeId: string, lead = "", trail = ""): Row {
  const row = document.createElement("div");
  row.setAttribute("data-node-id", nodeId);
  const paragraph = document.createElement("p");
  paragraph.textContent = `${lead}${QUOTE}${trail}`;
  row.append(paragraph);
  document.body.append(row);
  return { row, paragraph, end: lead.length + QUOTE.length };
}

/** 选中行内那段引用，返回用于登记的 Range。 */
function quoteRange(paragraph: HTMLParagraphElement, start: number, end: number) {
  const text = paragraph.firstChild as Text;
  const range = document.createRange();
  range.setStart(text, start);
  range.setEnd(text, end);
  return range;
}

it("reports the anchor while its row is mounted and nothing once the row is gone", async () => {
  const { row, paragraph, end } = renderRow("message-1");
  const range = quoteRange(paragraph, 0, end);
  rememberSelectedTextAnchor("selection-a", range, QUOTE);

  expect(selectedTextAnchorRects("selection-a")).toEqual([RECT]);

  row.remove();
  await settle();
  expect(selectedTextAnchorRects("selection-a")).toEqual([]);
});

it("rebuilds the anchor after the source row is unmounted and rendered again", async () => {
  const first = renderRow("message-1");
  rememberSelectedTextAnchor("selection-b", quoteRange(first.paragraph, 0, first.end), QUOTE);
  expect(selectedTextAnchorRects("selection-b")).toEqual([RECT]);

  // 切换对话：整行连同它的 Range 一起被卸载。
  first.row.remove();
  await settle();
  expect(selectedTextAnchorRects("selection-b")).toEqual([]);

  // 切回来：同一 node id，但是一批全新的 DOM 节点。
  const second = renderRow("message-1");
  await settle();
  expect(selectedTextAnchorRects("selection-b")).toEqual([RECT]);

  const scroll = jest.fn();
  second.paragraph.scrollIntoView = scroll;
  expect(revealSelectedTextAnchor("selection-b")).toBe(true);
  expect(scroll).toHaveBeenCalledWith({ block: "center", inline: "nearest" });

  // 引用被删掉之后，同样的 DOM 不应该再被认领。
  second.row.remove();
  await settle();
  expect(selectedTextAnchorRects("selection-b")).toEqual([]);
  expect(revealSelectedTextAnchor("selection-b")).toBe(false);
});

it("finds the quote again when a re-rendered row shifts the recorded offsets", async () => {
  const first = renderRow("message-2", "See ", " here");
  rememberSelectedTextAnchor("selection-c", quoteRange(first.paragraph, 4, 4 + QUOTE.length), QUOTE);
  expect(selectedTextAnchorRects("selection-c")).toEqual([RECT]);

  first.row.remove();
  await settle();

  // 行内多了一段前置文案，字符偏移整体后移。
  renderRow("message-2", "Intro added. ", " here");
  await settle();
  expect(selectedTextAnchorRects("selection-c")).toEqual([RECT]);
});

it("accepts a re-rendered row whose whitespace was re-flowed", async () => {
  const first = renderRow("message-3");
  rememberSelectedTextAnchor("selection-d", quoteRange(first.paragraph, 0, first.end), QUOTE);
  first.row.remove();
  await settle();

  const second = renderRow("message-3");
  second.paragraph.textContent = "quoted\n  passage";
  await settle();
  expect(selectedTextAnchorRects("selection-d")).toEqual([RECT]);
});

it("keeps quotes that never lived inside a timeline row scoped to their original DOM", async () => {
  const paragraph = document.createElement("p");
  paragraph.textContent = QUOTE;
  document.body.append(paragraph);
  rememberSelectedTextAnchor("selection-e", quoteRange(paragraph, 0, QUOTE.length), QUOTE);
  expect(selectedTextAnchorRects("selection-e")).toEqual([RECT]);

  paragraph.remove();
  await settle();
  expect(selectedTextAnchorRects("selection-e")).toEqual([]);

  // 没有宿主行可重建，重挂一段同文文本也不会被误认。
  const replacement = document.createElement("p");
  replacement.textContent = QUOTE;
  document.body.append(replacement);
  await settle();
  expect(selectedTextAnchorRects("selection-e")).toEqual([]);
});

it("stops searching for a row that is still missing until the document changes again", async () => {
  const { row, paragraph, end } = renderRow("message-4");
  rememberSelectedTextAnchor("selection-f", quoteRange(paragraph, 0, end), QUOTE);
  row.remove();
  await settle();

  const query = jest.spyOn(document, "querySelector");
  expect(selectedTextAnchorRects("selection-f")).toEqual([]);
  expect(selectedTextAnchorRects("selection-f")).toEqual([]);
  expect(query).toHaveBeenCalledTimes(1);
  query.mockRestore();
});
