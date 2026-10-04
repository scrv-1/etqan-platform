export type SourceKind = 'pdf' | 'text' | 'markdown' | 'docx' | 'youtube' | 'article' | 'paste' | 'legacy';
export type SegmentOrigin = 'text' | 'pdf-text' | 'ocr-reviewed' | 'transcript-manual' | 'transcript-file' | 'article' | 'legacy';
export type ConceptKind = 'concept' | 'prerequisite' | 'example';
export type QuestionKind = 'mcq' | 'flashcard' | 'short';
export type Origin = 'manual' | 'ai-accepted' | 'legacy' | 'sample';

export type Segment = {
  id: string;
  sourceId: string;
  order: number;
  text: string;
  page?: number;
  printedPage?: string;
  startSeconds?: number;
  endSeconds?: number;
  origin: SegmentOrigin;
};

export type Source = {
  id: string;
  title: string;
  kind: SourceKind;
  createdAt: string;
  updatedAt: string;
  fileId?: string;
  fileName?: string;
  fileSize?: number;
  mime?: string;
  pageCount?: number;
  extractedPages?: number[];
  scannedPages?: number[];
  url?: string;
  videoId?: string;
  transcriptLabel?: string;
  language?: string;
  contentHash?: string;
  warnings: string[];
  note?: string;
};

export type Citation = { segmentId: string; quote?: string };

export type Concept = {
  id: string;
  title: string;
  description: string;
  sourceId: string;
  kind: ConceptKind;
  citation: Citation | null;
  location: string;
  status: string;
  origin: Origin;
  createdAt: string;
};

export type Relation = {
  id: string;
  fromConceptId: string;
  toConceptId: string;
  label: string;
  confidence: number;
  reviewStatus: string;
  citation: Citation | null;
  sourceId: string | null;
  origin: Origin;
};

export type Question = {
  id: string;
  kind: QuestionKind;
  prompt: string;
  choices: string[];
  correctChoice: number;
  answer: string;
  rubric: string;
  conceptId: string;
  sourceId: string;
  citation: Citation | null;
  location: string;
  origin: Origin;
  updatedAt: string;
};

export type EvidenceSnapshot = {
  prompt: string;
  kind: QuestionKind;
  choices: string[];
  correctChoice: number;
  answer: string;
  rubric: string;
  conceptTitle: string;
  sourceTitle: string;
  location: string;
  citation: Citation | null;
  citationText?: string;
};

export type Outcome = 'correct' | 'incorrect' | 'self-met' | 'self-partial' | 'self-missed';

export type Evidence = {
  id: string;
  questionId: string;
  conceptId: string;
  sourceId: string;
  snapshot: EvidenceSnapshot;
  activity: QuestionKind;
  selectedChoice?: number;
  responseText?: string;
  outcome: Outcome;
  confidence: number;
  assisted: boolean;
  durationMs: number;
  createdAt: string;
};

export type StudyMode = { id: string; name: string; questionCount: number; allowHints: boolean };

export type SuggestionStatus = 'pending' | 'accepted' | 'rejected';
export type ConceptSuggestion = {
  id: string; runId: string; sourceId: string; type: 'concept'; status: SuggestionStatus; verified: boolean;
  key: string; title: string; description: string; kind: ConceptKind; citation: Citation; acceptedId?: string;
};
export type RelationSuggestion = {
  id: string; runId: string; sourceId: string; type: 'relation'; status: SuggestionStatus; verified: boolean;
  fromKey: string; toKey: string; label: string; citation: Citation; acceptedId?: string;
};
export type QuestionSuggestion = {
  id: string; runId: string; sourceId: string; type: 'question'; status: SuggestionStatus; verified: boolean;
  conceptKey: string; kind: QuestionKind; prompt: string; choices: string[]; correctChoice: number; answer: string; rubric: string; citation: Citation; acceptedId?: string;
};
export type Suggestion = ConceptSuggestion | RelationSuggestion | QuestionSuggestion;

export type AnalysisRun = { id: string; sourceId: string; segmentIds: string[]; hash: string; createdAt: string; warnings: string[] };

export type Workspace = {
  schema: 2;
  sample: boolean;
  sources: Source[];
  segments: Segment[];
  concepts: Concept[];
  relations: Relation[];
  questions: Question[];
  evidence: Evidence[];
  modes: StudyMode[];
  suggestions: Suggestion[];
  runs: AnalysisRun[];
  migratedFromLegacyAt?: string;
};

export type StoredFile = { id: string; name: string; mime: string; size: number; blob: Blob; sha256: string; createdAt: string };

export const LIMITS = {
  fileBytes: 25 * 1024 * 1024,
  pdfPagesPerExtraction: 30,
  pdfMaxPages: 1000,
  sourceChars: 500_000,
  backupBytes: 400 * 1024 * 1024,
  backupFiles: 600,
  ocrImageChars: 3_000_000,
  ocrMaxPx: 1600,
};
