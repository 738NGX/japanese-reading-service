import { createWordCombinationCandidates, convertToReadingCandidates } from '@/lib/japanese-reading/lookup';
import { getCombinationCandidates } from '@/lib/japanese-reading/combine';
import type { ReadingCombinationCandidate, ReadingMode } from '@/lib/japanese-reading/types';

export const runtime = 'edge';

const modes = new Set<ReadingMode>(['auto', 'place', 'person', 'free']);

function mergeCandidates(dictionary: ReadingCombinationCandidate[], inferred: ReadingCombinationCandidate[]) {
  const seen = new Set<string>();
  return [...dictionary, ...inferred].filter((candidate) => {
    if (seen.has(candidate.reading)) return false;
    seen.add(candidate.reading);
    return true;
  }).slice(0, 10);
}

function createResponse(input: string, mode: ReadingMode) {
  const result = convertToReadingCandidates(input, mode);
  const dictionary = createWordCombinationCandidates(result.normalizedInput, result.wordCandidates);
  const inferred = getCombinationCandidates(result.characters);
  return {
    ...result,
    mode,
    combinationCandidates: mergeCandidates(dictionary, inferred),
  };
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const input = (searchParams.get('q') ?? '').slice(0, 24);
  const requestedMode = searchParams.get('mode') as ReadingMode;
  const mode = modes.has(requestedMode) ? requestedMode : 'auto';
  if (!input.trim()) return Response.json({ error: '请输入汉字词。' }, { status: 400 });

  return Response.json(createResponse(input, mode), {
    headers: { 'Cache-Control': 'public, max-age=300, s-maxage=3600' },
  });
}
