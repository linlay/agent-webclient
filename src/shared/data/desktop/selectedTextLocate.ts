// Locating a quote crosses three surfaces mounted by three different hosts: the quote list
// (pill), the annotation surface that draws the markers, and the timeline that owns the
// collapse panels and the virtualized list. Every request therefore travels as one
// synchronous window event, exactly like the accepted-reference notification.
import { selectedTextAnchorHostId } from "@/shared/data/desktop/selectedTextAnchors";

export const SELECTED_TEXT_REFERENCE_FOCUS_EVENT = "agent:selected-text-reference-focus";
export const SELECTED_TEXT_TARGET_REVEAL_EVENT = "agent:selected-text-target-reveal";

export type SelectedTextReferenceFocusDetail = {
  referenceId: string;
  /** Set by whichever annotation surface revealed and highlighted the reference. */
  handled: boolean;
};

export type SelectedTextTargetRevealDetail = {
  /** Row id on the timeline side, where the collapse panels are known. */
  nodeId: string;
  /** Set by the timeline once it expanded the row's panels and scrolled to it. */
  handled: boolean;
};

/**
 * 折叠面板展开是一段约 500ms 的高度过渡（antd motionDeadline）：行刚被放出来的那一刻，
 * 量到的高度还是收起时的，此时算出来的落点必然偏——时间线的滚动会把收起的行居中，
 * 展开的内容全落到视口下方；批注层的居中也会被后面继续长高的布局顶走。所以定位不是
 * 一次性的，而是按"布局落定窗口"分几轮：窗口取 600ms（和批注层跟随布局的取值一致），
 * 每轮在窗口末尾结算一次，只有末次请求才落在最终行高上。
 */
const REVEAL_SETTLE_FRAMES = 36;

/** 窗口内按帧重试的上限就是窗口本身；超过窗口仍画不出来，才再给下一轮（或退回滚原文行）。 */
const LOCATE_ROUNDS = 3;

/** 定位窗口会持续几百毫秒，期间用户可能又点了另一条引用：让最后一次请求说话。 */
let locateGeneration = 0;

/** 选区登记的是带命名空间的 id（`message:<nodeId>` / `code:<nodeId>`），时间线的行不是。 */
function timelineNodeIdOf(targetId: string): string {
  return String(targetId || "").trim().replace(/^(?:message|code):/, "");
}

function announce<T extends { handled: boolean }>(type: string, detail: T): boolean {
  if (
    typeof window === "undefined" ||
    typeof window.dispatchEvent !== "function" ||
    typeof CustomEvent === "undefined"
  ) return false;
  window.dispatchEvent(new CustomEvent<T>(type, { detail }));
  return detail.handled;
}

/**
 * Asks the annotation surface that owns this reference to reveal and highlight it.
 * Returns whether a live surface consumed the request; `locateSelectedTextReference`
 * uses the answer to decide between "the marker is now highlighted" and the next step.
 */
function requestSelectedTextReferenceFocus(referenceId: string): boolean {
  if (!referenceId) return false;
  return announce(SELECTED_TEXT_REFERENCE_FOCUS_EVENT, { referenceId, handled: false });
}

/**
 * Asks the timeline to expand whatever collapse hides this row and scroll it into view.
 * A row inside a collapsed panel is not in the DOM at all (`destroyOnHidden`) or carries
 * `display: none`, so its markers cannot be re-created until the panel opens.
 */
function requestSelectedTextTargetReveal(nodeId: string): boolean {
  const id = String(nodeId || "").trim();
  if (!id) return false;
  return announce(SELECTED_TEXT_TARGET_REVEAL_EVENT, { nodeId: id, handled: false });
}

/**
 * Fallback for references whose anchor cannot be revealed (a sent message, a steered
 * request): reveal the source block the quote came from. Quotes restored from
 * attachments carry their own reference id as the target, so they simply no-op.
 */
function revealSelectedTextTarget(targetId: string): boolean {
  const id = String(targetId || "").trim();
  if (!id || typeof document === "undefined") return false;
  const nodeId = timelineNodeIdOf(id);
  const target = Array.from(document.querySelectorAll<HTMLElement>("[data-node-id]"))
    .find(node => node.dataset.nodeId === id || node.dataset.nodeId === nodeId);
  if (!target) return false;
  target.scrollIntoView?.({ block: "center", inline: "nearest" });
  return true;
}

/**
 * Locating one quote, in the order that keeps the common case cheap:
 *
 * 1. an annotation surface that still holds a drawable anchor reveals and highlights the marker;
 * 2. otherwise the quote is hidden — typically inside a collapsed panel — so the timeline
 *    expands the panel that holds the row and scrolls to it, and the marker request is
 *    retried while that expansion settles;
 * 3. otherwise the row is not reachable at all, so scroll to whatever the DOM still shows.
 *
 * Step 2 is issued while the panel is still collapsed, so its scroll target is the row at its
 * old height. One round therefore only serves to get the row back into the DOM; the last
 * request of the round (the one made once the layout had time to settle) is what actually
 * lands on the marker.
 */
export function locateSelectedTextReference(referenceId: string, targetId: string): void {
  if (!referenceId) return;
  if (requestSelectedTextReferenceFocus(referenceId)) return;
  // 锚点自己记着它落在哪一行；targetId 只作为锚点已被回收时的兜底。
  const hostId = selectedTextAnchorHostId(referenceId) || timelineNodeIdOf(targetId);
  if (!requestSelectedTextTargetReveal(hostId)) {
    revealSelectedTextTarget(targetId);
    return;
  }
  if (typeof requestAnimationFrame !== "function") {
    revealSelectedTextTarget(targetId);
    return;
  }
  const mine = (locateGeneration += 1);
  let round = 0;
  let frame = 0;
  const step = () => {
    // 更晚的定位请求已经接手，这一轮让位，免得两个锚点每帧互相抢滚动。
    if (mine !== locateGeneration) return;
    // 窗口内按帧重试：行一回到 DOM 就能点亮标记，不必等满整段过渡。
    const claimed = requestSelectedTextReferenceFocus(referenceId);
    frame += 1;
    if (frame < REVEAL_SETTLE_FRAMES) {
      requestAnimationFrame(step);
      return;
    }
    // 窗口末尾：布局这时才算落定，刚才那次请求是按最终行高发出的，认领了就是滚到标记了。
    if (claimed) return;
    round += 1;
    if (round >= LOCATE_ROUNDS) {
      // 怎么也画不出来：退回滚原文行，让它所在的那一行至少出现在视口里。
      revealSelectedTextTarget(targetId);
      return;
    }
    // 行还在折叠里（面板没长完，或它藏在更外层的折叠中），让时间线按现在的行高再滚一次。
    requestSelectedTextTargetReveal(hostId);
    frame = 0;
    requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}
