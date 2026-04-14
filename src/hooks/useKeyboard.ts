import { useCallback, useEffect } from 'react';

export const useKeyboard = (props: {
  getAllHost: () => NodeListOf<HTMLElement> | undefined;
  onKeyDown?: (e: KeyboardEvent) => void;
  onEnter?: (element: HTMLElement) => void;
  onClose?: () => void;
  enabled?: boolean;
}) => {
  const { getAllHost, onKeyDown, onEnter, onClose, enabled = true } = props;

  useEffect(() => {
    if (enabled) {
      window.addEventListener('keydown', handleKeyDown);
    } else {
      window.removeEventListener('keydown', handleKeyDown);
    }
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [enabled]);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    const key = e.key.toLocaleLowerCase();

    if (key === 'enter') {
      e.preventDefault();
      const activeElement = document.activeElement as HTMLElement;
      if (activeElement && activeElement?.tabIndex === 0) {
        onEnter ? onEnter(activeElement) : activeElement?.click();
      }
    } else if (key === 'escape') {
      onClose?.();
    } else if (key === 'arrowdown') {
      e.preventDefault();
      focusNextElement();
    } else if (key === 'arrowup') {
      e.preventDefault();
      focusNextElement(false);
    } else {
      onKeyDown?.(e);
    }
  }, []);

  const focusNextElement = (next = true) => {
    const liArr: HTMLElement[] = Array.from(getAllHost() || []);
    const currentIndex = document.activeElement ? liArr.indexOf(document.activeElement as any) : 0;
    let nextIndex = currentIndex + (next ? 1 : -1);
    if (nextIndex < 0) {
      nextIndex = liArr.length - 1;
    }
    liArr[nextIndex % liArr.length]?.focus();
  };
};
