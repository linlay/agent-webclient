import React, { createContext, useContext, useEffect, useRef, useState } from "react";
import { isDesktopAppMode } from "@/shared/utils/routing";
import type { RealtimeTransport } from "@/features/transport/contracts/realtimeTransport";
import { RealtimeTransportError } from "@/features/transport/contracts/realtimeTransportErrors";
import {
  readDesktopBridges,
} from "@/features/transport/lib/desktopBridge";
import { DesktopRealtimeTransport } from "@/features/transport/lib/desktopRealtimeTransport";
import {
  DesktopWorkPanelTransport,
  type WorkPanelTransport,
} from "@/features/transport/lib/desktopWorkPanelTransport";
import { StandaloneRealtimeTransport } from "@/features/transport/lib/standaloneRealtimeTransport";
import { useI18n } from "@/shared/i18n";

type RealtimeTransportFactory = () => RealtimeTransport;

const RealtimeTransportContext = createContext<RealtimeTransport | null>(null);
const WorkPanelTransportContext = createContext<WorkPanelTransport | null>(null);

export interface RealtimeTransportProviderProps {
  children: React.ReactNode;
  standaloneFactory?: RealtimeTransportFactory;
}

function desktopBlockCode(error: RealtimeTransportError): string {
  return error.code === "version_mismatch" || error.code === "desktop_bridge_incompatible"
    ? "DESKTOP_BRIDGE_INCOMPATIBLE"
    : "DESKTOP_BRIDGE_UNAVAILABLE";
}

const DesktopRealtimeBlocked: React.FC<{ error: RealtimeTransportError }> = ({ error }) => {
  const { t } = useI18n();
  return (
    <main className="realtime-transport-blocked" role="alert">
      <section>
        <h1>{t("platformError.code.unavailable")}</h1>
        <p>{error.message || t("platformError.code.service_unavailable")}</p>
        <code>{desktopBlockCode(error)}</code>
      </section>
    </main>
  );
};

export const RealtimeTransportProvider: React.FC<
  RealtimeTransportProviderProps
> = ({ children, standaloneFactory }) => {
  const desktopModeRef = useRef(isDesktopAppMode());
  const transportRef = useRef<RealtimeTransport | null>(null);
  const workPanelRef = useRef<WorkPanelTransport | null>(null);
  const bridgeErrorRef = useRef<RealtimeTransportError | null>(null);
  const [, setResourceRevision] = useState(0);

  const ensureTransport = (): boolean => {
    if (transportRef.current || bridgeErrorRef.current) return false;
    if (!desktopModeRef.current) {
      transportRef.current = (standaloneFactory || (() => new StandaloneRealtimeTransport()))();
    } else {
      const bridges = readDesktopBridges();
      if (!bridges.platformFramePort || !bridges.workPanel) {
        bridgeErrorRef.current = new RealtimeTransportError(
          bridges.platformFramePortIncompatible ? "desktop_bridge_incompatible" : "desktop_bridge_missing",
          bridges.platformFramePortIncompatible
            ? "Desktop Platform Frame Port transport version is incompatible"
            : "Desktop Platform Frame Port/workpanel bridge is unavailable",
        );
      } else {
        transportRef.current = new DesktopRealtimeTransport(bridges.platformFramePort);
        workPanelRef.current = new DesktopWorkPanelTransport(bridges.workPanel);
      }
    }
    return Boolean(transportRef.current);
  };

  ensureTransport();

  useEffect(() => {
    // StrictMode 会清理后重新安装 effect；此时必须重建已 dispose 的 adapter。
    if (ensureTransport()) {
      setResourceRevision((revision) => revision + 1);
    }
    return () => {
      transportRef.current?.dispose();
      transportRef.current = null;
      workPanelRef.current = null;
    };
    // adapter 实例严格跟随本次 Provider mount；StrictMode 重挂由上面的 setup 显式恢复。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const blockingError = bridgeErrorRef.current;
  if (desktopModeRef.current && blockingError) {
    return <DesktopRealtimeBlocked error={blockingError} />;
  }

  return (
    <RealtimeTransportContext.Provider value={transportRef.current}>
      <WorkPanelTransportContext.Provider value={workPanelRef.current}>
        {children}
      </WorkPanelTransportContext.Provider>
    </RealtimeTransportContext.Provider>
  );
};

export function useRealtimeTransport(): RealtimeTransport {
  const transport = useContext(RealtimeTransportContext);
  if (!transport) {
    throw new Error(
      "useRealtimeTransport must be used within RealtimeTransportProvider",
    );
  }
  return transport;
}

export function useOptionalRealtimeTransport(): RealtimeTransport | null {
  return useContext(RealtimeTransportContext);
}

export function useOptionalWorkPanelTransport(): WorkPanelTransport | null {
  return useContext(WorkPanelTransportContext);
}
