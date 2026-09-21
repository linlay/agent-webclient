import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Input, Popover, Tooltip } from "antd";
import type { TooltipRef } from "antd/es/tooltip";
import type { SelectedTextFragment } from "@/shared/contracts/selectedTextReference";
import {
  SELECTED_TEXT_REFERENCE_FOCUS_EVENT,
  type SelectedTextReferenceFocusDetail,
} from "@/shared/data/desktop/selectedTextLocate";
import {
  revealSelectedTextAnchor,
  selectedTextAnchorRects,
} from "@/shared/data/desktop/selectedTextAnchors";
import { useI18n } from "@/shared/i18n";
import { MaterialIcon } from "@/shared/ui/MaterialIcon";
import styles from "./SelectionAnnotations.module.css";
import { TextAreaRef } from "antd/es/input/TextArea";

const MARKER_ANCHOR_ATTRIBUTE = "data-selection-marker-anchor";
const HIGHLIGHT_ATTRIBUTE = "data-selection-highlight";
/** 布局跟随窗口：折叠面板的高度过渡最长 500ms（antd motionDeadline），再留一帧余量。 */
const LAYOUT_SETTLE_MS = 600;

/** 标记自身的定位样式由本组件写入，那不是"页面变了"，否则每次重定位都会自我驱动。 */
function isOwnMarker(node: Node): boolean {
  return (
    typeof Element !== "undefined" &&
    node instanceof Element &&
    (node.hasAttribute(MARKER_ANCHOR_ATTRIBUTE) ||
      node.hasAttribute(HIGHLIGHT_ATTRIBUTE))
  );
}

function readClock(): number {
  return typeof performance === "undefined" ? Date.now() : performance.now();
}

type Marker = {
  id: string;
  number: number;
  annotation: string;
  rects: ReturnType<typeof selectedTextAnchorRects>;
};

export function SelectionAnnotations({
  fragments,
  onAnnotationChange,
  onRemove,
}: {
  fragments: readonly SelectedTextFragment[];
  onAnnotationChange: (id: string, annotation: string) => void;
  onRemove: (id: string) => void;
}) {
  const { t } = useI18n();
  const [markers, setMarkers] = useState<Marker[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  // 批注只在确认时写回引用：打字过程只动这份草稿，引用、引用列表和标号提示都不跟着抖。
  const [draft, setDraft] = useState("");
  const [draftFor, setDraftFor] = useState<string | null>(null);
  const seen = useRef(new Set<string>());
  const editor = useRef<HTMLDivElement>(null);
  const input = useRef<TextAreaRef>(null);
  // 让定位请求也能立刻重算标记：它认领时就等于"这一刻画得出来"，不该再等下一次滚动。
  const scheduleRefresh = useRef<(settleMs?: number) => void>(() => undefined);
  // Popover 的 ref 用来手动触发重对齐。
  const popover = useRef<TooltipRef>(null);

  useLayoutEffect(() => {
    let frame: number | null = null;
    // 展开/收起折叠面板会挪动原文：面板在一段高度过渡里长到最终尺寸，工具与思考块
    // 则是整块换掉显隐。只在 DOM 变化的那一帧量一次，标记会停在旧位置（甚至因为量不到
    // 而消失），所以在一个短窗口里持续跟随，等布局落定后再收手。
    let settleUntil = 0;
    const refresh = () => {
      frame = null;
      const next = fragments.flatMap((fragment, index) => {
        const rects = selectedTextAnchorRects(fragment.reference.id);
        return rects.length
          ? [
              {
                id: fragment.reference.id,
                number: fragment.reference.annotationIndex ?? index + 1,
                annotation: fragment.reference.annotation?.trim() || "",
                rects,
              },
            ]
          : [];
      });
      setMarkers((current) =>
        JSON.stringify(current) === JSON.stringify(next) ? current : next,
      );
      if (readClock() < settleUntil) frame = requestAnimationFrame(refresh);
    };
    const schedule = (settleMs = 0) => {
      settleUntil = Math.max(settleUntil, readClock() + settleMs);
      if (frame === null) frame = requestAnimationFrame(refresh);
    };
    scheduleRefresh.current = schedule;
    refresh();
    const onScroll = () => schedule();
    const onResize = () => schedule(LAYOUT_SETTLE_MS);
    document.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onResize);
    const observer = new MutationObserver((records) => {
      if (records.some((record) => !isOwnMarker(record.target))) {
        schedule(LAYOUT_SETTLE_MS);
      }
    });
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
      // 折叠面板是靠 class/style 换掉内容显隐的，只看子树增删会漏掉这块。
      attributes: true,
      attributeFilter: ["class", "style"],
    });
    return () => {
      if (frame !== null) cancelAnimationFrame(frame);
      scheduleRefresh.current = () => undefined;
      document.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onResize);
      observer.disconnect();
    };
  }, [fragments]);

  useEffect(() => {
    const ids = new Set(fragments.map((fragment) => fragment.reference.id));
    const added = fragments.filter(
      (fragment) => !seen.current.has(fragment.reference.id),
    );
    seen.current = ids;
    const latest = added
      .filter(
        (fragment) => selectedTextAnchorRects(fragment.reference.id).length,
      )
      .pop();
    if (latest) setActiveId(latest.reference.id);
    else
      setActiveId((current) => (current && ids.has(current) ? current : null));
  }, [fragments]);

  const active = fragments.find(
    (fragment) => fragment.reference.id === activeId,
  );
  const marker = markers.find((item) => item.id === activeId);
  // Highlights stay hidden until the fragment's marker is opened, and follow the editor exactly.
  const openId = active && marker ? activeId : null;
  // 草稿跟着"打开的是哪一条"走：换一条或关掉就重新取已存批注，同一条开着时保留正在输入的内容。
  if (draftFor !== openId) {
    setDraftFor(openId);
    setDraft(openId ? active?.reference.annotation || "" : "");
  }
  // 回车和确认按钮走这里：没改动就不必再写一遍，空草稿会按协议清掉原有批注。
  const commitDraft = () => {
    if (!active) return;
    if (draft !== (active.reference.annotation || "")) {
      onAnnotationChange(active.reference.id, draft);
    }
    setActiveId(null);
  };
  useEffect(() => {
    if (openId && marker) input.current?.focus({ preventScroll: true });
  }, [openId, Boolean(marker)]);
  // Popover 只监听锚点祖先链上的滚动容器和 window；marker 挂在 body 下，
  // 消息列表却在 .messages-scroll 内部滚动，两者不相交，所以重对齐得自己驱动。
  useLayoutEffect(() => {
    popover.current?.forceAlign();
  }, [markers, openId]);
  useEffect(() => {
    if (!openId) return;
    const dismiss = (event: PointerEvent) => {
      if (
        event.target instanceof Element &&
        (editor.current?.contains(event.target) ||
          event.target.closest("[data-selection-marker]"))
      )
        return;
      // 点外面只是关掉浮层，等同于放弃：没回车确认的草稿不写回引用。
      setActiveId(null);
    };
    document.addEventListener("pointerdown", dismiss, true);
    return () => document.removeEventListener("pointerdown", dismiss, true);
  }, [openId]);
  // 引用列表（pill）里点某条引用时，把锚点拉回视口并复用"打开批注"这一套状态，
  // 高亮、浮层和聚焦与直接点 marker 完全一致；只有真正持有该锚点的这一侧才会认领请求。
  useEffect(() => {
    const focus = (event: Event) => {
      const detail = (event as CustomEvent<SelectedTextReferenceFocusDetail>)
        .detail;
      if (!detail || detail.handled) return;
      if (
        !fragments.some(
          (fragment) => fragment.reference.id === detail.referenceId,
        )
      )
        return;
      if (!revealSelectedTextAnchor(detail.referenceId)) return;
      detail.handled = true;
      setActiveId(detail.referenceId);
      scheduleRefresh.current();
    };
    window.addEventListener(SELECTED_TEXT_REFERENCE_FOCUS_EVENT, focus);
    return () =>
      window.removeEventListener(SELECTED_TEXT_REFERENCE_FOCUS_EVENT, focus);
  }, [fragments]);

  if (!markers.length) return null;
  const width = Math.min(360, window.innerWidth - 24);

  // 编辑器只作为打开中的 Popover 的内容渲染，定位与翻转全部交给 Popover；
  // textarea 里是本地草稿，回车或确认按钮才把它写回引用。
  const editorNode =
    active && marker ? (
      <div
        ref={editor}
        className={styles.editor}
        style={{ width }}
        role="dialog"
        aria-label={t("selection.fragment.annotationFor", {
          index: marker.number,
        })}
      >
        <Input.TextArea
          ref={input}
          rows={1}
          autoSize
          variant="borderless"
          value={draft}
          aria-label={t("selection.fragment.annotationFor", {
            index: marker.number,
          })}
          placeholder={t("selection.fragment.inlinePlaceholder")}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            // Popover 的 Escape 处理挂在触发器上，焦点在弹层内收不到，这里自己兜住。
            event.stopPropagation();
            if (event.key === "Escape") {
              event.preventDefault();
              setActiveId(null);
              return;
            }
            if (
              event.key !== "Enter" ||
              event.shiftKey ||
              event.nativeEvent.isComposing
            )
              return;
            // 回车是唯一"看得见"的确认：此前输入的内容一直只是本地草稿。
            event.preventDefault();
            commitDraft();
          }}
        />
        <button
          type="button"
          className={styles.action}
          aria-label={t("selection.fragment.confirmAnnotation")}
          title={t("selection.fragment.confirmAnnotation")}
          onClick={commitDraft}
        >
          <MaterialIcon name="keyboard_return" />
        </button>
        <button
          type="button"
          className={`${styles.action} ${styles.remove}`}
          aria-label={t("selection.fragment.remove", {
            index: marker.number,
          })}
          title={t("selection.fragment.remove", { index: marker.number })}
          onClick={() => {
            onRemove(active.reference.id);
            setActiveId(null);
          }}
        >
          <MaterialIcon name="delete" />
        </button>
      </div>
    ) : null;

  return createPortal(
    <>
      {markers.map((item) => {
        const isOpen = openId === item.id;
        const anchor = item.rects[item.rects.length - 1];
        const badge = (
          <button
            type="button"
            className={styles.marker}
            data-selection-marker={item.id}
            aria-label={t("selection.fragment.editAnnotation", {
              index: item.number,
            })}
            aria-expanded={isOpen}
            onPointerDown={(event) => event.preventDefault()}
            onClick={() => setActiveId(item.id)}
          >
            {item.number}
          </button>
        );
        return (
          <React.Fragment key={item.id}>
            {isOpen
              ? item.rects.map((rect, index) => (
                  <span
                    key={index}
                    className={styles.highlight}
                    data-selection-highlight={item.id}
                    style={{
                      left: rect.left,
                      top: rect.top,
                      width: rect.width,
                      height: rect.height,
                    }}
                    aria-hidden="true"
                  />
                ))
              : null}
            <Popover
              // 只有打开的那个需要重对齐句柄。
              ref={isOpen ? popover : undefined}
              open={isOpen}
              // 打开完全由 activeId 驱动：点同一个 marker 落在 onClick 上，不会被当成 toggle 关掉。
              trigger={[]}
              placement="right"
              arrow={false}
              destroyOnHidden
              content={isOpen ? editorNode : null}
              // 项目主题没有 Popover token，默认皮肤用的是 antd 自带底色和圆角，这里全部让位给 .editor。
              styles={{
                body: {
                  padding: 0,
                  background: "transparent",
                  boxShadow: "none",
                  borderRadius: 0,
                },
              }}
            >
              <Tooltip
                title={item.annotation}
                open={isOpen ? false : undefined}
                trigger="hover"
                placement="top"
                styles={{ body: { maxWidth: 280, whiteSpace: "pre-wrap" } }}
              >
                <span
                  className={styles.markerAnchor}
                  data-selection-marker-anchor={item.id}
                  style={{
                    left: Math.min(
                      window.innerWidth - 30,
                      Math.max(4, anchor.right - 11),
                    ),
                    top: Math.max(4, anchor.top - 24),
                  }}
                >
                  {badge}
                </span>
              </Tooltip>
            </Popover>
          </React.Fragment>
        );
      })}
    </>,
    document.body,
  );
}
