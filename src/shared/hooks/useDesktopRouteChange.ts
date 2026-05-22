import { useEffect } from "react";
import { useNavigate } from "react-router-dom";

type DesktopRouteChangedPayload = {
  type?: unknown;
  pathname?: unknown;
  search?: unknown;
  hash?: unknown;
};

function normalizeRoutePart(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function buildDesktopRouteTarget(
  payload: DesktopRouteChangedPayload,
): string | null {
  const rawPathname = normalizeRoutePart(payload.pathname);
  if (!rawPathname) {
    return null;
  }

  let pathnameWithoutQuery = rawPathname;
  let queryFromPath = "";
  let hashFromPath = "";
  const hashIndex = pathnameWithoutQuery.indexOf("#");
  if (hashIndex >= 0) {
    hashFromPath = pathnameWithoutQuery.slice(hashIndex + 1);
    pathnameWithoutQuery = pathnameWithoutQuery.slice(0, hashIndex);
  }
  const queryIndex = pathnameWithoutQuery.indexOf("?");
  if (queryIndex >= 0) {
    queryFromPath = pathnameWithoutQuery.slice(queryIndex + 1);
    pathnameWithoutQuery = pathnameWithoutQuery.slice(0, queryIndex);
  }

  const pathname = pathnameWithoutQuery.startsWith("/")
    ? pathnameWithoutQuery || "/"
    : `/${pathnameWithoutQuery}`;
  const rawSearch = normalizeRoutePart(payload.search) || queryFromPath;
  const rawHash = normalizeRoutePart(payload.hash) || hashFromPath;
  const search = rawSearch
    ? rawSearch.startsWith("?")
      ? rawSearch
      : `?${rawSearch}`
    : "";
  const hash = rawHash
    ? rawHash.startsWith("#")
      ? rawHash
      : `#${rawHash}`
    : "";

  return `${pathname}${search}${hash}`;
}

export const useDesktopRouteChange = () => {
  const navigate = useNavigate();

  useEffect(() => {
    const handleServiceWebviewDeliver = (event: Event) => {
      const payload =
        ((event as CustomEvent<DesktopRouteChangedPayload | undefined>)
          .detail as DesktopRouteChangedPayload | undefined) || {};
      if (payload.type !== "desktopRouteChanged") {
        return;
      }

      const target = buildDesktopRouteTarget(payload);
      if (!target) {
        return;
      }
      const cur = `${location.pathname}${location.search}${location.hash}`;
      if (cur === target) {
        return;
      }
      navigate(target, { replace: true });
    };

    window.addEventListener(
      "zenmind:service-webview:deliver",
      handleServiceWebviewDeliver,
    );
    return () => {
      window.removeEventListener(
        "zenmind:service-webview:deliver",
        handleServiceWebviewDeliver,
      );
    };
  }, []);
}