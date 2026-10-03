export type MemoryKind = "memory" | "owner" | "daily";
export interface MemoryDocument { kind: MemoryKind; date?: string; content: string; revision: string; exists: boolean }
export interface MemoryDates { dates: string[]; nextBefore: string; today: string }
export interface MemoryMatch { kind: MemoryKind; date?: string; line: number; text: string }
export interface MemoryMatches { matches: MemoryMatch[]; nextBefore: string; maxMatches: number; searchedDailyFiles: number }
