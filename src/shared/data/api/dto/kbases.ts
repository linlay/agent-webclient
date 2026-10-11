export interface KnowledgeChunk { unit?: "chars"; strategy?: "window" | "regex" | "structural"; maxChars?: number; overlapChars?: number }
export interface KnowledgeRetrieval { topK?: number; candidateFloor?: number; candidateMultiplier?: number; candidateMax?: number; minScore?: number; recencyWeight?: number; recencyHalfLifeDays?: number; rerank?: boolean; queryExpansion?: boolean }
export interface KnowledgeModels { reranker?: {modelKey: string}; queryExpansion?: {modelKey: string}; embedding?: { modelKey: string; prompt?: "raw" | "qwen3" | "embeddinggemma" } }
export interface KnowledgeCollection { name: string; sourcePath: string; description?: string; editable?: boolean; defaultQuery?: boolean; include?: string[]; exclude?: string[]; chunk?: KnowledgeChunk }
export type RetrievalMethod = "query" | "search" | "vsearch" | "gsearch";
export interface KnowledgeBase {
 id: string; baseRevision?: string; name: string; description: string; collections: KnowledgeCollection[]; sourcePath?: string;
 stale?: boolean; indexing?: boolean; degraded?: boolean; vectorsPending?: boolean;
 chunk?: KnowledgeChunk; textEncoding?: string; models?: KnowledgeModels; retrieval?: KnowledgeRetrieval;
 createdAt: number; updatedAt: number; indexedAt: number;
 state: "unindexed" | "indexing" | "ready" | "error"; error?: string; refreshError?: string; sourceWarnings?: string[]; invalidId?: boolean; orphaned?: boolean;
}
export interface KnowledgeBaseInput { baseRevision?: string; name: string; description: string; collections?: KnowledgeCollection[]; sourcePath?: string; chunk?: KnowledgeChunk; textEncoding?: string; models?: KnowledgeModels; retrieval?: KnowledgeRetrieval }
export interface KnowledgeDocument { file: string; collection: string; relativePath: string; title: string; bytes: number }
export interface KnowledgeHit {
 resultId: string; file: string; collection: string; relativePath: string; title: string; score: number | null; scoreType: "vector_similarity" | "unavailable"; rankingScore?: number;
 chunk?: { id: string; seq: number; range: { lineStart: number; lineEnd: number } };
 evidence: { id: string; text: string; range: { lineStart: number; lineEnd: number } };
}
export interface KnowledgeSearch { results: KnowledgeHit[]; trace?: { degraded: boolean | unknown[]; candidateBudgetExhausted: boolean; coverage?: { retrievalUsed?: string[] } } }
export interface KnowledgeBaseStatistics { capabilities: { fullText?: { available: boolean }; vector?: { complete: boolean; queryModelConfigured: boolean }; graph?: { complete: boolean } } }
export interface KnowledgeBaseStatus { libraryId: string; baseRevision: string; state: KnowledgeBase["state"]; indexedAt: number; indexing: boolean; stale: boolean; degraded: boolean; vectorsPending: boolean; orphaned: boolean; error: string; refreshError: string; statsAvailable: boolean; statistics?: KnowledgeBaseStatistics; statsError?: string }
export interface KnowledgeRead { file: string; body?: string; evidence?: { text: string }; readRange?: { hasMore: boolean } }

/** Composer usage catalog. Deliberately excludes source paths and admin configuration. */
export interface KBaseOption {
 id: string; name: string; description?: string;
 collections: { name: string; description?: string }[];
 readable: boolean; indexing: boolean; degraded: boolean;
 unavailableReason?: string;
}
export interface KBaseOptionsResponse {
 agentKey: string;
 capability: { available: boolean; reason?: string };
 boundLibraryId?: string;
 libraries: KBaseOption[];
}
