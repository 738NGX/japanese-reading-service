import { FormEvent, useState } from 'react';
import type { ConvertResult, KanjiReadingCandidate, ReadingCombinationCandidate } from '@/lib/japanese-reading/types';

type ApiResult = ConvertResult & {
  exactDictionaryCandidates: ReadingCombinationCandidate[];
  normalizedDictionaryCandidates: ReadingCombinationCandidate[];
  directCandidates: ReadingCombinationCandidate[];
  rendakuCandidates: ReadingCombinationCandidate[];
};

const candidateKey = (candidate: KanjiReadingCandidate) => `${candidate.kanji}:${candidate.type}:${candidate.reading}`;

export default function App() {
  const [input, setInput] = useState('');
  const [result, setResult] = useState<ApiResult | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [selectedKeys, setSelectedKeys] = useState<Record<number, string>>({});
  const [previewOverride, setPreviewOverride] = useState<ReadingCombinationCandidate | null>(null);
  const inputLength = Array.from(input).length;

  async function submit(event: FormEvent) {
    event.preventDefault();
    setLoading(true); setError('');
    try {
      const response = await fetch(`${import.meta.env.BASE_URL}api/convert?q=${encodeURIComponent(input)}`);
      const body = await response.json() as ApiResult & { error?: string };
      if (!response.ok) throw new Error(body.error ?? '查询失败，请稍后重试。');
      setResult(body); setSelectedKeys({}); setPreviewOverride(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '查询失败，请稍后重试。');
    } finally { setLoading(false); }
  }

  function selectReading(index: number, candidate: KanjiReadingCandidate) {
    setPreviewOverride(null);
    setSelectedKeys((current) => ({ ...current, [index]: candidateKey(candidate) }));
  }

  return <main>
    <section className="hero">
      <p className="eyebrow">JAPANESE READING LAB</p>
      <h1>汉字日语读音候选</h1>
      <p>输入汉字词，查看外部词典记录、字形检索线索与可人工调整的逐字预览。</p>
    </section>
    <section className="tool">
      <form onSubmit={submit}>
        <label htmlFor="word">汉字词</label>
        <div className="input-row"><input id="word" value={input} onChange={(event) => setInput(event.target.value)} placeholder="输入汉字词" maxLength={24} /><button disabled={loading || !input.trim()}>{loading ? '查询中…' : '生成候选'}</button></div>
        <p className="input-meta">{inputLength} / 24 个字符</p>
      </form>
      {error ? <p className="error" role="alert">{error}</p> : null}
      {result ? <Results result={result} selectedKeys={selectedKeys} previewOverride={previewOverride} onSelect={selectReading} onApplyRendaku={setPreviewOverride} /> : <p className="hint">OpenCC 只用于转换为适合查询的日文字形；整词资料与单字推测会分层展示。</p>}
    </section>
    <footer>真实地名、人名、站名与品牌名可能有固定读法，请回到权威资料核验。</footer>
  </main>;
}

function Results({ result, selectedKeys, previewOverride, onSelect, onApplyRendaku }: {
  result: ApiResult;
  selectedKeys: Record<number, string>;
  previewOverride: ReadingCombinationCandidate | null;
  onSelect: (index: number, candidate: KanjiReadingCandidate) => void;
  onApplyRendaku: (candidate: ReadingCombinationCandidate) => void;
}) {
  const selectedCandidates = result.characters.map((character, index) => character.candidates.find((candidate) => candidateKey(candidate) === selectedKeys[index])).filter((candidate): candidate is KanjiReadingCandidate => Boolean(candidate));
  const hasCompleteSelection = selectedCandidates.length === result.characters.length;
  const selectedReading = selectedCandidates.map((candidate) => candidate.surfaceReading).join('');
  const selectedRomaji = selectedCandidates.map((candidate) => candidate.romaji ?? '').join('');
  const hasDictionaryEvidence = result.exactDictionaryCandidates.length + result.normalizedDictionaryCandidates.length > 0;
  const preview = previewOverride ?? (hasCompleteSelection ? { reading: selectedReading, romaji: selectedRomaji, label: '手动逐字直拼', notes: selectedCandidates.map((candidate) => candidate.reading) } : null);

  return <section className="results">
    {result.normalizedForms.length > 1 ? <p className="conversion">字形转换：<b>{result.normalizedForms[0]}</b> ⇒ <b>{result.normalizedForms[1]}</b></p> : null}
    <p className="source-scope">资料范围：JMnedict 本地快照在此仅提供日语地名表记与读音；未保留释义、地域或原始条目 ID，同形条目不能在本页面内消歧。<a href="https://www.edrdg.org/enamdict/enamdict_doc.html" target="_blank" rel="noreferrer">数据说明</a> · <a href="https://www.edrdg.org/edrdg/licence.html" target="_blank" rel="noreferrer">许可与署名</a></p>
    {result.exactDictionaryCandidates.length > 0 ? <CandidateGroup title="原表记的外部词典记录" hint="证据等级：已记录。相同表记的多条读音可能属于不同实体。" candidates={result.exactDictionaryCandidates} /> : null}
    {result.normalizedDictionaryCandidates.length > 0 ? <CandidateGroup title="字形归一化后的词典检索线索" hint="证据等级：检索线索。转换后的同形表记可能属于其他实体，不能当作原输入的确定读音。" candidates={result.normalizedDictionaryCandidates} /> : null}
    <details className="exploration" open={!hasDictionaryEvidence}>
      <summary>单字探索（未证实）</summary>
      <p className="hint">以下只基于 KANJIDIC2 的单字条目，不会因上方已有词典记录而改变其证据等级。</p>
      {result.directCandidates.length > 0 ? <CandidateGroup title="逐字直拼" hint="证据等级：单字推测。" candidates={result.directCandidates} /> : <p className="hint">外部单字词典中没有可用于直拼的读音记录。</p>}
      {result.rendakuCandidates.length > 0 ? <CandidateGroup title="连浊可能变体" hint="证据等级：音系推测。只满足保守条件，不包含构词语义分析；可应用到下方的逐字预览。" candidates={result.rendakuCandidates} onApply={onApplyRendaku} /> : null}
    </details>
    <section className="preview" aria-live="polite">
      <h2>当前逐字预览</h2>
      {preview ? <article className="candidate selected-result"><span>{previewOverride ? '连浊预览' : '手动直拼'}</span><strong>{preview.reading}</strong><small>{preview.romaji}</small><p>{previewOverride ? preview.notes.at(-1) : preview.notes.join(' + ')}</p></article> : <p className="hint">请为每个字选择读音，或从“连浊可能变体”中应用一项预览。</p>}
    </section>
    <h2>逐字读音候选</h2>
    <p className="hint">点击读音只会更新这一条逐字预览；不会重排或改写词典记录。</p>
    <div className="characters">{result.characters.map((character, index) => <article key={`${character.originalChar}-${index}`}><h3>{character.originalChar}{character.normalizedChar !== character.originalChar ? <em> ⇒ {character.normalizedChar}</em> : null}</h3>{character.candidates.slice(0, 8).map((candidate) => <button type="button" className={selectedKeys[index] === candidateKey(candidate) ? 'reading selected' : 'reading'} key={`${candidate.type}-${candidate.reading}`} onClick={() => onSelect(index, candidate)}><b>{candidate.reading}</b><small>{candidate.label}</small></button>)}</article>)}</div>
  </section>;
}

function CandidateGroup({ title, hint, candidates, onApply }: { title: string; hint?: string; candidates: ReadingCombinationCandidate[]; onApply?: (candidate: ReadingCombinationCandidate) => void }) {
  const visibleCandidates = candidates.slice(0, 5);
  const hiddenCandidates = candidates.slice(5);
  return <section className="candidate-group">
    <h2>{title}</h2>
    {hint ? <p className="hint">{hint}</p> : null}
    <div className="candidate-list">{visibleCandidates.map((candidate) => <CandidateCard key={`${candidate.evidence}-${candidate.reading}`} candidate={candidate} onApply={onApply} />)}</div>
    {hiddenCandidates.length > 0 ? <details className="more-candidates"><summary>显示其余 {hiddenCandidates.length} 项</summary><div className="candidate-list">{hiddenCandidates.map((candidate) => <CandidateCard key={`${candidate.evidence}-${candidate.reading}`} candidate={candidate} onApply={onApply} />)}</div></details> : null}
  </section>;
}

function CandidateCard({ candidate, onApply }: { candidate: ReadingCombinationCandidate; onApply?: (candidate: ReadingCombinationCandidate) => void }) {
  return <article className={candidate.source === 'dictionary' ? 'candidate primary' : 'candidate'}><span>{evidenceLabel(candidate)}</span><strong>{candidate.reading}</strong><small>{candidate.romaji}</small><p>{candidate.notes.join(' · ')}</p>{onApply && candidate.evidence === 'rendaku' ? <button className="apply-rendaku" type="button" onClick={() => onApply(candidate)}>应用到预览</button> : null}</article>;
}

function evidenceLabel(candidate: ReadingCombinationCandidate): string {
  switch (candidate.evidence) {
    case 'dictionary-exact': return '已记录';
    case 'dictionary-normalized': return '检索线索';
    case 'rendaku': return '连浊可能';
    default: return '单字推测';
  }
}
