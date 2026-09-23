// The boundary between the research pipeline and external data sources.
// A provider turns one search request into source candidates; everything
// after that (normalization, dedup, storage) is provider-agnostic.

export type SourceType = "web" | "news";

export type SearchRequest = {
  text: string;
  type: SourceType;
  maxResults: number;
};

export type SourceCandidate = {
  url: string;
  title: string | null;
  publisher: string | null;
  // ISO 8601, or null when the provider does not know.
  publishedAt: string | null;
  snippet: string | null;
  type: SourceType;
  // Provider-reported relevance, when it has one (higher is better).
  score: number | null;
};

export type SearchResult = {
  candidates: SourceCandidate[];
  fromCache: boolean;
};

export interface SearchProvider {
  readonly id: string;
  readonly label: string;
  readonly supports: readonly SourceType[];
  // False when the provider cannot run at all (e.g. missing API key).
  isConfigured(): boolean;
  search(request: SearchRequest): Promise<SearchResult>;
}
