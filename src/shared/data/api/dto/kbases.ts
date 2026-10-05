export interface KnowledgeBase {
 id: string; name: string; description: string; sourcePath: string;
 createdAt: number; updatedAt: number; indexedAt: number;
 state: "unindexed" | "indexing" | "ready" | "error"; error?: string;
}
export interface KnowledgeBaseInput { name: string; description: string; sourcePath?: string }
export interface KnowledgeDocument { file: string; title: string; bytes: number }
export interface KnowledgeHit {
 resultId: string; file: string; title: string; score: number;
 evidence: { id: string; text: string; range: { lineStart: number; lineEnd: number } };
}
export interface KnowledgeSearch { results: KnowledgeHit[]; trace: { degraded: boolean; candidateBudgetExhausted: boolean } }
export interface KnowledgeRead { file: string; body?: string; evidence?: { text: string }; readRange?: { hasMore: boolean } }
