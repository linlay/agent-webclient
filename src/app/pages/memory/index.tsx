import { MemoryInfoConsole } from "@/features/memory/components/MemoryConsole";
import { useMemoryRecordsInitialization } from "@/features/memory/hooks/useMemoryRecordsInitialization";

export const MemoryPage = () => {
  useMemoryRecordsInitialization();

  return (
    <main className="memory-info-page">
      <MemoryInfoConsole surface="page" />
    </main>
  );
};
