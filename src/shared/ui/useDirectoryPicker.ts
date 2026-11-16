import { useCallback, useEffect, useRef, useState } from "react";
import { listHostDirectories } from "@/shared/data";
import type { HostDirectoryListResponse } from "@/shared/data/api/dto/agents";
import {
  canUseDesktopFileSystemBridge,
  selectWorkspaceDirectory,
} from "@/shared/data/desktop/desktopFileSystem";

export interface DirectoryPickerModel {
  open: boolean;
  loading: boolean;
  error: string;
  listing: HostDirectoryListResponse | null;
}

export interface DirectoryPicker extends DirectoryPickerModel {
  /** True when the Desktop host can open its native directory dialog. */
  nativeAvailable: boolean;
  canChoose: boolean;
  /**
   * Resolves with the chosen absolute directory, or null when nothing was
   * chosen (cancelled, superseded or already busy). Desktop hosts show their
   * native dialog; browser hosts open the host directory browser instead.
   */
  pick: (startPath?: string) => Promise<string | null>;
  browseTo: (path: string) => void;
  choose: () => string | null;
  close: () => void;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Directory selection shared by every surface that needs an absolute path:
 * the Desktop native picker first, and a directory-only browser over
 * `GET /api/admin/host/directories` when the client is not on the host.
 *
 * Only one selection can be in flight. A browser response is applied only
 * when it belongs to the newest request, so a slow earlier directory can
 * neither replace a newer listing nor be confirmed.
 */
export function useDirectoryPicker(): DirectoryPicker {
  const nativeAvailable = canUseDesktopFileSystemBridge();
  const [model, setModel] = useState<DirectoryPickerModel>({
    open: false,
    loading: false,
    error: "",
    listing: null,
  });
  // Mutable mirror so pick/choose/close can read the latest value without
  // waiting for a render.
  const current = useRef(model);
  const update = useCallback((patch: Partial<DirectoryPickerModel>) => {
    current.current = { ...current.current, ...patch };
    setModel(current.current);
  }, []);
  // Bumped by every listing and by close(), so late responses are dropped.
  const sequence = useRef(0);
  const nativeBusy = useRef(false);
  const pending = useRef<((path: string | null) => void) | null>(null);

  const settle = useCallback((path: string | null) => {
    const resolve = pending.current;
    pending.current = null;
    resolve?.(path);
  }, []);

  const close = useCallback(() => {
    sequence.current += 1;
    update({ open: false, loading: false, error: "", listing: null });
    settle(null);
  }, [settle, update]);

  const browseTo = useCallback((path: string) => {
    const seq = ++sequence.current;
    update({ loading: true, error: "" });
    void listHostDirectories(path).then(
      (response) => {
        if (seq !== sequence.current) return;
        update({ loading: false, listing: response.data });
      },
      (error: unknown) => {
        if (seq !== sequence.current) return;
        // A failed first listing would leave the browser with no directory to
        // navigate from, so fall back to the host home directory once.
        if (!current.current.listing && path.trim()) {
          update({ loading: false, error: "" });
          browseTo("");
          return;
        }
        // The previous listing stays visible so the user can navigate
        // elsewhere, but it can no longer be confirmed.
        update({ loading: false, error: errorMessage(error) });
      },
    );
  }, [update]);

  const pick = useCallback((startPath = ""): Promise<string | null> => {
    if (!nativeAvailable) {
      if (pending.current) return Promise.resolve(null);
      return new Promise<string | null>((resolve) => {
        pending.current = resolve;
        update({ open: true, loading: false, error: "", listing: null });
        browseTo(startPath.trim());
      });
    }
    if (nativeBusy.current) return Promise.resolve(null);
    nativeBusy.current = true;
    const seq = ++sequence.current;
    update({ open: false, loading: true, error: "", listing: null });
    return selectWorkspaceDirectory()
      .then(
        (path) => {
          if (seq !== sequence.current) return null;
          update({ loading: false });
          return path;
        },
        (error: unknown) => {
          if (seq === sequence.current) update({ loading: false });
          throw error;
        },
      )
      .finally(() => {
        nativeBusy.current = false;
      });
  }, [browseTo, nativeAvailable, update]);

  const choose = useCallback((): string | null => {
    const state = current.current;
    if (!state.listing || state.loading || state.error) return null;
    const path = state.listing.path;
    sequence.current += 1;
    update({ open: false, loading: false, error: "", listing: null });
    settle(path);
    return path;
  }, [settle, update]);

  // A dialog still open when the host unmounts must not leave its caller
  // waiting forever.
  useEffect(() => () => {
    sequence.current += 1;
    settle(null);
  }, [settle]);

  return {
    nativeAvailable,
    open: model.open,
    loading: model.loading,
    error: model.error,
    listing: model.listing,
    canChoose: Boolean(model.listing) && !model.loading && !model.error,
    pick,
    browseTo,
    choose,
    close,
  };
}
