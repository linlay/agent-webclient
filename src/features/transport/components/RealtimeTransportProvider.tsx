import React, { createContext, useContext, useEffect, useRef } from "react";
import { isDesktopAppMode } from "@/shared/utils/routing";
import type { RealtimeTransport } from "@/features/transport/contracts/realtimeTransport";
import { StandaloneRealtimeTransport } from "@/features/transport/lib/standaloneRealtimeTransport";
import { useI18n } from "@/shared/i18n";

type RealtimeTransportFactory = () => RealtimeTransport;

const RealtimeTransportContext = createContext<RealtimeTransport | null>(null);

export interface RealtimeTransportProviderProps {
  children: React.ReactNode;
  standaloneFactory?: RealtimeTransportFactory;
}

const DESKTOP_BLOCK_CODE = "DESKTOP_BRIDGE_UNAVAILABLE";

const DesktopRealtimeBlocked: React.FC = () => {
  const { t } = useI18n();
  return (
    <main className="realtime-transport-blocked" role="alert">
      <section>
        <h1>{t("platformError.code.unavailable")}</h1>
        <p>{t("platformError.code.service_unavailable")}</p>
        <code>{DESKTOP_BLOCK_CODE}</code>
      </section>
    </main>
  );
};

export const RealtimeTransportProvider: React.FC<
  RealtimeTransportProviderProps
> = ({ children, standaloneFactory }) => {
  const desktopModeRef = useRef(isDesktopAppMode());
  const transportRef = useRef<RealtimeTransport | null>(null);

  if (!desktopModeRef.current && !transportRef.current) {
    transportRef.current = (standaloneFactory || (() => new StandaloneRealtimeTransport()))();
  }

  useEffect(
    () => () => {
      transportRef.current?.dispose();
      transportRef.current = null;
    },
    [],
  );

  if (desktopModeRef.current) {
    return <DesktopRealtimeBlocked />;
  }

  return (
    <RealtimeTransportContext.Provider value={transportRef.current}>
      {children}
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
