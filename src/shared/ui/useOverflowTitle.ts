import { useEffect, useRef, useState } from "react";

const OVERFLOW_TOLERANCE_PX = 1;

function childElements(node: HTMLElement): HTMLElement[] {
  return Array.from(node.children).filter(
    (child): child is HTMLElement => child instanceof HTMLElement,
  );
}

/**
 * Whether the element (or any nested element) clips its text.
 * Nested elements are included because ellipsis is often applied per child
 * inside a flex row, leaving the container itself without scroll overflow.
 */
export function isOverflowingText(node: HTMLElement | null): boolean {
  if (!node) return false;
  if (node.scrollWidth - node.clientWidth > OVERFLOW_TOLERANCE_PX) return true;
  return childElements(node).some(isOverflowingText);
}

/**
 * Attach `ref` to the text container and pass the returned `title` to the
 * element so the full text only shows as a native tooltip while it is clipped.
 */
export function useOverflowTitle<T extends HTMLElement = HTMLSpanElement>(text: string) {
  const ref = useRef<T | null>(null);
  const [overflowing, setOverflowing] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const measure = () => setOverflowing(isOverflowingText(node));
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    childElements(node).forEach((child) => observer.observe(child));
    return () => observer.disconnect();
  }, [text]);

  return { ref, title: overflowing ? text : undefined };
}
