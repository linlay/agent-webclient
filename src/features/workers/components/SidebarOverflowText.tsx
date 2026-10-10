import React, { useEffect, useRef, useState, type CSSProperties } from "react";
import styles from "./WorkerChatPreviewItem.module.css";

const TITLE_SCROLL_PIXELS_PER_SECOND = 35;

/** Fade overflowing sidebar text; chat titles also scroll on hover. */
export function SidebarOverflowText({
  text,
  className = styles.title,
}: {
  text: string;
  className?: string;
}) {
  const containerRef = useRef<HTMLSpanElement>(null);
  const textRef = useRef<HTMLSpanElement>(null);
  const [overflow, setOverflow] = useState(0);

  useEffect(() => {
    const container = containerRef.current;
    const content = textRef.current;
    if (!container || !content) return;
    const measure = () => setOverflow(container.clientWidth > 0
      ? Math.max(0, content.scrollWidth - container.clientWidth) : 0);
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(container);
    observer.observe(content);
    return () => observer.disconnect();
  }, [text]);

  return <span ref={containerRef} className={`${styles.overflowText} ${className}`} title={text}
    data-overflow={overflow > 0 ? "true" : undefined}
    style={{
      "--chat-title-offset": `${-overflow}px`,
      "--chat-title-duration": `${overflow / TITLE_SCROLL_PIXELS_PER_SECOND}s`,
    } as CSSProperties}>
    <span ref={textRef} className={styles.titleText}>{text}</span>
  </span>;
}
