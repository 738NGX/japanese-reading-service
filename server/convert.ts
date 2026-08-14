import { createWordCombinationCandidates, convertToReadingCandidates } from '../lib/japanese-reading/lookup';
import { getCombinationCandidateGroups } from '../lib/japanese-reading/combine';

export function createApiResponse(requestUrl: string) {
  const url = new URL(requestUrl, 'http://localhost');
  const input = url.searchParams.get('q') ?? '';
  if (!input.trim()) return { status: 400, cacheControl: 'no-store', body: { error: '请输入汉字词。' } };
  if (Array.from(input).length > 24) return { status: 400, cacheControl: 'no-store', body: { error: '最多输入 24 个字符。' } };
  if (!/[\u3400-\u9fff\uf900-\ufaff]/u.test(input)) return { status: 400, cacheControl: 'no-store', body: { error: '请输入至少一个汉字。' } };
  const result = convertToReadingCandidates(input);
  const exactWordCandidates = result.wordCandidates.filter((candidate) => candidate.matchedForm === 'original');
  const normalizedWordCandidates = result.wordCandidates.filter((candidate) => candidate.matchedForm === 'japanese-normalized');
  const directGroups = getCombinationCandidateGroups(result.characters);
  const { directCandidates, rendakuCandidates } = directGroups;
  return {
    status: 200,
    cacheControl: 'public, max-age=300, s-maxage=3600',
    body: {
      ...result,
      exactDictionaryCandidates: createWordCombinationCandidates(exactWordCandidates),
      normalizedDictionaryCandidates: createWordCombinationCandidates(normalizedWordCandidates),
      directCandidates,
      rendakuCandidates,
    },
  };
}
