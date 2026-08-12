import { createWordCombinationCandidates, convertToReadingCandidates } from '../lib/japanese-reading/lookup';
import { getCombinationCandidates } from '../lib/japanese-reading/combine';
import type { ReadingCombinationCandidate, ReadingMode } from '../lib/japanese-reading/types';

const modes = new Set<ReadingMode>(['auto', 'place', 'person', 'free']);

function mergeCandidates(dictionary: ReadingCombinationCandidate[], inferred: ReadingCombinationCandidate[]) {
  const seen = new Set<string>();
  return [...dictionary, ...inferred].filter((candidate) => {
    if (seen.has(candidate.reading)) return false;
    seen.add(candidate.reading);
    return true;
  }).slice(0, 10);
}

export function createApiResponse(requestUrl: string) {
  const url = new URL(requestUrl, 'http://localhost');
  const input = (url.searchParams.get('q') ?? '').slice(0, 24);
  const requestedMode = url.searchParams.get('mode') as ReadingMode;
  const mode = modes.has(requestedMode) ? requestedMode : 'auto';
  if (!input.trim()) return { status: 400, cacheControl: 'no-store', body: { error: '请输入汉字词。' } };
  const result = convertToReadingCandidates(input, mode);
  const dictionary = createWordCombinationCandidates(result.normalizedInput, result.wordCandidates);
  const inferred = getCombinationCandidates(result.characters);
  return {
    status: 200,
    cacheControl: 'public, max-age=300, s-maxage=3600',
    body: { ...result, mode, combinationCandidates: mergeCandidates(dictionary, inferred) },
  };
}
