export type MemoryKind = "memory" | "owner" | "daily";
export interface MemoryDocument { kind: MemoryKind; date?: string; content: string; revision: string; exists: boolean }
export interface MemoryDates { dates: string[]; nextBefore: string; today: string }
export interface MemoryMatch { kind: MemoryKind; date?: string; line: number; text: string }
export interface MemoryMatches { matches: MemoryMatch[]; nextBefore: string; maxMatches: number; searchedDailyFiles: number }

export interface MemoryRangeRequest { startDate: string; endDate: string; includeArchived?: boolean }
export interface MemoryRangeStatus extends MemoryRangeRequest {
    id: string;
    state: "queued" | "running" | "canceling" | "completed" | "failed" | "canceled";
    modelKey: string;
    timezone: string;
    startedAt: number;
    finishedAt?: number;
    scannedChats: number;
    selectedRuns: number;
    skippedRuns: number;
    processedBatches: number;
    reusedBatches: number;
    emptyRuns: number;
    newFacts?: number;
    error?: string;
}
export interface MemoryMaintenanceStatus {
    enabled: boolean;
    automatic: boolean;
    pollIntervalSeconds: number;
    modelKey: string;
    timezone: string;
    state: "idle" | "queued" | "running" | "failed";
    processedBatches: number;
    error?: string;
    manual?: MemoryRangeStatus;
}
