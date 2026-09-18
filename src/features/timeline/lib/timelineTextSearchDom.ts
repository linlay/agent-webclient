const MARK_CLASS = "timeline-text-search-mark";
const MARK_CURRENT_CLASS = "timeline-text-search-mark-current";

function applyMarkStyle(mark: HTMLElement, current: boolean): void {
  if (current) {
    mark.style.backgroundColor = "orange";
  } else {
    mark.style.backgroundColor = "yellow";
  }
}

export function clearHighlights(): void {
  if (typeof document === "undefined") return;
  const marks = document.querySelectorAll(`mark.${MARK_CLASS}`);
  marks.forEach((mark) => {
    const parent = mark.parentNode;
    if (!parent) return;
    parent.replaceChild(document.createTextNode(mark.textContent || ""), mark);
  });
}

function collectTextNodes(root: Element): Text[] {
  const textNodes: Text[] = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let current = walker.nextNode();
  while (current) {
    textNodes.push(current as Text);
    current = walker.nextNode();
  }
  return textNodes;
}

function highlightContainer(
  root: Element,
  query: string,
  ordinal: number,
  scrollToCurrent: boolean,
): void {
  const needle = query.trim();
  const lowerNeedle = needle.toLowerCase();

  const textNodes = collectTextNodes(root);
  const texts = textNodes.map((node) => node.nodeValue || "");
  const offsets: number[] = [0];
  for (let i = 0; i < texts.length; i += 1) {
    offsets.push(offsets[i] + texts[i].length);
  }

  const fullText = texts.join("");
  const lowerFull = fullText.toLowerCase();

  const matchRanges: Array<{ start: number; end: number }> = [];
  let cursor = 0;
  let index = lowerFull.indexOf(lowerNeedle, cursor);
  while (index !== -1) {
    matchRanges.push({ start: index, end: index + needle.length });
    cursor = index + needle.length;
    index = lowerFull.indexOf(lowerNeedle, cursor);
  }

  if (matchRanges.length === 0) return;

  const matchMarks: HTMLElement[][] = matchRanges.map(() => []);

  for (let i = 0; i < textNodes.length; i += 1) {
    const node = textNodes[i];
    const text = texts[i];
    if (!text) continue;
    const nodeStart = offsets[i];
    const nodeEnd = offsets[i + 1];

    const fragments: Array<{
      matchIndex: number;
      start: number;
      end: number;
    }> = [];
    for (let m = 0; m < matchRanges.length; m += 1) {
      const start = Math.max(matchRanges[m].start, nodeStart);
      const end = Math.min(matchRanges[m].end, nodeEnd);
      if (start < end) {
        fragments.push({
          matchIndex: m,
          start: start - nodeStart,
          end: end - nodeStart,
        });
      }
    }
    if (fragments.length === 0) continue;

    const fragment = document.createDocumentFragment();
    let cursorPos = 0;
    for (const piece of fragments) {
      if (piece.start > cursorPos) {
        fragment.appendChild(
          document.createTextNode(text.slice(cursorPos, piece.start)),
        );
      }
      const mark = document.createElement("mark");
      mark.className = MARK_CLASS;
      mark.textContent = text.slice(piece.start, piece.end);
      applyMarkStyle(mark, false);
      fragment.appendChild(mark);
      matchMarks[piece.matchIndex].push(mark);
      cursorPos = piece.end;
    }
    if (cursorPos < text.length) {
      fragment.appendChild(document.createTextNode(text.slice(cursorPos)));
    }
    node.parentNode?.replaceChild(fragment, node);
  }

  if (ordinal < 0) return;
  const currentGroup =
    matchMarks[Math.max(0, Math.min(ordinal - 1, matchMarks.length - 1))];
  for (const mark of currentGroup) {
    mark.classList.add(MARK_CURRENT_CLASS);
    applyMarkStyle(mark, true);
  }
  if (scrollToCurrent && currentGroup[0]) {
    currentGroup[0].scrollIntoView({ block: "center", behavior: "smooth" });
  }
}

export function highlightAllRendered(
  query: string,
  searchableNodeIds: Set<string>,
  activeNodeId: string | undefined,
  activeOrdinal: number,
  scrollToCurrent: boolean,
): void {
  clearHighlights();
  const needle = query.trim();
  if (!needle) return;
  document.querySelectorAll("[data-node-id]").forEach((container) => {
    const nodeId = container.getAttribute("data-node-id");
    if (!nodeId || !searchableNodeIds.has(nodeId)) return;
    const isActive = nodeId === activeNodeId;
    highlightContainer(
      container,
      needle,
      isActive ? activeOrdinal : -1,
      isActive && scrollToCurrent,
    );
  });
}

export function waitForCurrentThenHighlightAll(
  nodeId: string,
  query: string,
  searchableNodeIds: Set<string>,
  activeNodeId: string | undefined,
  activeOrdinal: number,
): void {
  let attempts = 0;
  const attempt = () => {
    const root = document.querySelector(`[data-node-id="${nodeId}"]`);
    if (root) {
      highlightAllRendered(
        query,
        searchableNodeIds,
        activeNodeId,
        activeOrdinal,
        true,
      );
      return;
    }
    attempts += 1;
    if (attempts < 60) requestAnimationFrame(attempt);
  };
  requestAnimationFrame(attempt);
}
