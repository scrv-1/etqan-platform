import { useGetLearningCapabilities, getGetLearningCapabilitiesQueryKey, type LearningCapabilities } from '@workspace/api-client-react';

export const FALLBACK_CAPS: LearningCapabilities = { ai: false, ocr: false, youtube: false, message: 'تعذر الوصول إلى الخادم لمعرفة الخدمات المتاحة.', maxAnalysisCharacters: 18000, maxSegments: 20 };

export function useCapabilities() {
  const q = useGetLearningCapabilities({ query: { queryKey: getGetLearningCapabilitiesQueryKey(), staleTime: 60_000, retry: 1 } });
  return { caps: q.data ?? FALLBACK_CAPS, loading: q.isLoading, failed: q.isError, refetch: q.refetch };
}
