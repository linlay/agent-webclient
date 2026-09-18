import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { SelectedTextFragment } from "@/shared/contracts/selectedTextReference";
import { selectedTextAnchorRects } from "@/shared/data/desktop/selectedTextAnchors";
import { useI18n } from "@/shared/i18n";
import styles from "./SelectionAnnotations.module.css";

type Marker = { id: string; number: number; rects: ReturnType<typeof selectedTextAnchorRects> };

export function SelectionAnnotations({ fragments, onAnnotationChange }: {
  fragments: readonly SelectedTextFragment[];
  onAnnotationChange: (id: string, annotation: string) => void;
}) {
  const { t } = useI18n();
  const [markers, setMarkers] = useState<Marker[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const seen = useRef(new Set<string>());
  const editor = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);

  useLayoutEffect(() => {
    let frame: number | null = null;
    const refresh = () => {
      frame = null;
      const next = fragments.flatMap((fragment, index) => {
        const rects = selectedTextAnchorRects(fragment.reference.id);
        return rects.length ? [{ id: fragment.reference.id, number: fragment.reference.annotationIndex ?? index + 1, rects }] : [];
      });
      setMarkers(current => JSON.stringify(current) === JSON.stringify(next) ? current : next);
    };
    const schedule = () => { if (frame === null) frame = requestAnimationFrame(refresh); };
    refresh();
    document.addEventListener("scroll", schedule, true);
    window.addEventListener("resize", schedule);
    const observer = new MutationObserver(schedule);
    observer.observe(document.body, {childList:true,subtree:true,characterData:true});
    return () => {
      if (frame !== null) cancelAnimationFrame(frame);
      document.removeEventListener("scroll", schedule, true);
      window.removeEventListener("resize", schedule);
      observer.disconnect();
    };
  }, [fragments]);

  useEffect(() => {
    const ids = new Set(fragments.map(fragment => fragment.reference.id));
    const added = fragments.filter(fragment => !seen.current.has(fragment.reference.id));
    seen.current = ids;
    const latest = added.filter(fragment => selectedTextAnchorRects(fragment.reference.id).length).pop();
    if (latest) setActiveId(latest.reference.id);
    else setActiveId(current => current && ids.has(current) ? current : null);
  }, [fragments]);

  const active = fragments.find(fragment => fragment.reference.id === activeId);
  const marker = markers.find(item => item.id === activeId);
  useEffect(() => {
    if (activeId && marker) input.current?.focus({preventScroll:true});
  }, [activeId, Boolean(marker)]);
  useEffect(() => {
    if (!activeId) return;
    const dismiss = (event: PointerEvent) => {
      if (event.target instanceof Element &&
        (editor.current?.contains(event.target) || event.target.closest("[data-selection-marker]"))) return;
      setActiveId(null);
    };
    document.addEventListener("pointerdown", dismiss, true);
    return () => document.removeEventListener("pointerdown", dismiss, true);
  }, [activeId]);

  if (!markers.length) return null;
  const width = Math.min(560, window.innerWidth - 24);
  const first = marker?.rects[0];
  const last = marker?.rects[marker.rects.length - 1];
  return createPortal(<>
    {markers.map(item => <React.Fragment key={item.id}>
      {item.rects.map((rect,index) => <span key={index} className={styles.highlight} style={{left:rect.left,top:rect.top,width:rect.width,height:rect.height}} aria-hidden="true" />)}
      <button type="button" className={styles.marker} data-selection-marker={item.id}
        style={{left:Math.min(window.innerWidth - 36, Math.max(4,item.rects[item.rects.length-1].right - 14)),top:Math.max(4,item.rects[item.rects.length-1].top - 30)}}
        aria-label={t("selection.fragment.editAnnotation",{index:item.number})}
        aria-expanded={activeId === item.id}
        onPointerDown={event=>event.preventDefault()}
        onClick={()=>setActiveId(item.id)}>{item.number}</button>
    </React.Fragment>)}
    {active && marker && first && last ? <div ref={editor} className={styles.editor}
      style={{width,left:Math.max(12,Math.min(window.innerWidth-width-12,first.left)),top:Math.max(8,Math.min(window.innerHeight-92,first.top >= 112 ? first.top-108 : last.bottom+12))}}
      role="dialog" aria-label={t("selection.fragment.annotationFor",{index:marker.number})}>
      <textarea ref={input} rows={1} value={active.reference.annotation || ""}
        aria-label={t("selection.fragment.annotationFor",{index:marker.number})}
        placeholder={t("selection.fragment.inlinePlaceholder")}
        onChange={event=>onAnnotationChange(active.reference.id,event.target.value)}
        onKeyDown={event=>{
          event.stopPropagation();
          if (event.key === "Escape" || (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing)) {
            event.preventDefault(); setActiveId(null);
          }
        }} />
    </div> : null}
  </>,document.body);
}
