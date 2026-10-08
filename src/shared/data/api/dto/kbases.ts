export interface KnowledgeCollection { name: string; sourcePath: string }
export type RetrievalMethod = "query" | "search" | "vsearch" | "gsearch";
export interface KnowledgeBase {
 id: string; name: string; description: string; collections: KnowledgeCollection[]; sourcePath?: string;
 createdAt: number; updatedAt: number; indexedAt: number;
 state: "unindexed" | "indexing" | "ready" | "error"; error?: string; refreshError?: string; sourceWarnings?: string[]; invalidId?: boolean; orphaned?: boolean;
}
export interface KnowledgeBaseInput { name: string; description: string; collections?: KnowledgeCollection[]; sourcePath?: string }
export interface KnowledgeDocument { file: string; collection: string; relativePath: string; title: string; bytes: number }
export interface KnowledgeHit {
 resultId: string; file: string; collection: string; relativePath: string; title: string; score: number | null; scoreType: "vector_similarity" | "unavailable"; rankingScore?: number;
 chunk?: { id: string; seq: number; range: { lineStart: number; lineEnd: number } };
 evidence: { id: string; text: string; range: { lineStart: number; lineEnd: number } };
}
export interface KnowledgeSearch { results: KnowledgeHit[]; trace?: { degraded: boolean | unknown[]; candidateBudgetExhausted: boolean; coverage?: { retrievalUsed?: string[] } } }
export interface KnowledgeBaseStatus { capabilities: { fullText?: { available: boolean }; vector?: { complete: boolean; queryModelConfigured: boolean }; graph?: { complete: boolean } } }
export interface KnowledgeRead { file: string; body?: string; evidence?: { text: string }; readRange?: { hasMore: boolean } }
