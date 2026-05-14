import { MemoryInfoConsole } from "@/features/settings/components/MemoryInfoModal";
import { useMemoryRecordsInitialization } from "@/features/settings/hooks/useMemoryRecordsInitialization";

export const MemoryPage = () => {
  useMemoryRecordsInitialization();

  return (
    <main className="memory-info-page">
      <MemoryInfoConsole surface="page" />
    </main>
  );
};
