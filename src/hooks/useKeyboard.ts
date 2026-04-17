import { useCallback, useEffect, useRef } from "react";

interface CallbackRef {
  getAllHost: () => NodeListOf<HTMLElement> | undefined;
  onKeyDown?: (e: KeyboardEvent) => void;
  onEnter?: (element: HTMLElement) => void;
  onClose?: () => void;
}
interface UseKeyboardProps extends CallbackRef {
  enabled?: boolean;
}
export const useKeyboard = (props: UseKeyboardProps) => {
  const { getAllHost, onKeyDown, onEnter, onClose, enabled = true } = props;
  const callbackRef = useRef<CallbackRef>({
    getAllHost,
    onKeyDown,
    onEnter,
    onClose,
  });

  useEffect(() => {
    if (enabled) {
      window.addEventListener("keydown", handleKeyDown);
    } else {
      window.removeEventListener("keydown", handleKeyDown);
    }
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [enabled]);

  useEffect(() => {
    callbackRef.current = {
      getAllHost,
      onKeyDown,
      onEnter,
      onClose,
    };
  }, [getAllHost, onKeyDown, onEnter, onClose]);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    const key = e.key.toLocaleLowerCase();

    if (key === "enter") {
      e.preventDefault();
      const activeElement = document.activeElement as HTMLElement;
      if (activeElement && activeElement?.tabIndex === 0) {
        callbackRef.current?.onEnter
          ? callbackRef.current?.onEnter(activeElement)
          : activeElement?.click();
      }
    } else if (key === "escape") {
      callbackRef.current?.onClose?.();
    } else if (key === "arrowdown") {
      e.preventDefault();
      focusNextElement();
    } else if (key === "arrowup") {
      e.preventDefault();
      focusNextElement(false);
    } else {
      callbackRef.current?.onKeyDown?.(e);
    }
  }, []);

  const focusNextElement = (next = true) => {
    const liArr: HTMLElement[] = Array.from(
      callbackRef.current?.getAllHost() || [],
    );
    const currentIndex = document.activeElement
      ? liArr.indexOf(document.activeElement as any)
      : 0;
    let nextIndex = currentIndex + (next ? 1 : -1);
    if (nextIndex < 0) {
      nextIndex = liArr.length - 1;
    }
    liArr[nextIndex % liArr.length]?.focus();
  };
};
