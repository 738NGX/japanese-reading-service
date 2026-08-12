'use client';

import { FormEvent, useState } from 'react';
import type { ConvertResult, KanjiReadingCandidate, ReadingCombinationCandidate, ReadingMode } from '@/lib/japanese-reading/types';

type ApiResult = ConvertResult & { mode: ReadingMode; combinationCandidates: ReadingCombinationCandidate[] };

const modes: Array<{ value: ReadingMode; label: string }> = [
  { value: 'auto', label: '自动' }, { value: 'place', label: '地名' },
  { value: 'person', label: '人名' }, { value: 'free', label: '自由组合' },
];

export default function Home() {
  const [input, setInput] = useState('南京');
  const [mode, setMode] = useState<ReadingMode>('auto');
  const [result, setResult] = useState<ApiResult | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [selectedKeys, setSelectedKeys] = useState<Record<number, string>>({});

  async function submit(event: FormEvent) {
    event.preventDefault();
    setLoading(true); setError('');
    try {
      const response = await fetch(`/api/convert?q=${encodeURIComponent(input)}&mode=${mode}`);
      const body = await response.json() as ApiResult & { error?: string };
      if (!response.ok) throw new Error(body.error ?? '查询失败，请稍后重试。');
      setResult(body);
      setSelectedKeys({});
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '查询失败，请稍后重试。');
    } finally { setLoading(false); }
  }

  function selectReading(index: number, candidate: KanjiReadingCandidate) {
    setSelectedKeys((current) => ({ ...current, [index]: candidateKey(candidate) }));
  }

  return <main>
    <section className="hero">
      <p className="eyebrow">JAPANESE READING LAB</p>
      <h1>汉字日语读音候选</h1>
      <p>输入中文地名、人名或汉字词，获得词典优先、可手动核验的日语读音候选。</p>
    </section>
    <section className="tool" aria-label="读音查询工具">
      <form onSubmit={submit}>
        <label htmlFor="word">汉字词</label>
        <div className="input-row"><input id="word" value={input} onChange={(event) => setInput(event.target.value)} placeholder="例如：诹访、南京、李白" maxLength={24} /><button disabled={loading}>{loading ? '查询中…' : '生成候选'}</button></div>
        <fieldset><legend>用途</legend>{modes.map((item) => <label className="mode" key={item.value}><input type="radio" name="mode" value={item.value} checked={mode === item.value} onChange={() => setMode(item.value)} />{item.label}</label>)}</fieldset>
      </form>
      {error ? <p className="error" role="alert">{error}</p> : null}
      {result ? <Results result={result} selectedKeys={selectedKeys} onSelect={selectReading} /> : <p className="hint">使用 OpenCC 实时转换为日文新字体；整词词典命中会优先显示。</p>}
    </section>
    <footer>候选仅供辅助判断。地名、人名等专名请以权威词典或官方资料为准。</footer>
  </main>;
}

function candidateKey(candidate: KanjiReadingCandidate): string {
  return `${candidate.kanji}:${candidate.type}:${candidate.reading}`;
}

function Results({ result, selectedKeys, onSelect }: {
  result: ApiResult;
  selectedKeys: Record<number, string>;
  onSelect: (index: number, candidate: KanjiReadingCandidate) => void;
}) {
  const selectedCandidates = result.characters
    .map((character, index) => character.candidates.find((candidate) => candidateKey(candidate) === selectedKeys[index]) ?? character.selected ?? character.candidates[0])
    .filter((candidate): candidate is KanjiReadingCandidate => Boolean(candidate));
  const selectedReading = selectedCandidates.map((candidate) => candidate.surfaceReading).join('');
  const selectedRomaji = selectedCandidates.map((candidate) => candidate.romaji ?? '').join('');

  return <section className="results" aria-live="polite">
    {result.normalizedForms.length > 1 ? <p className="conversion">字形转换：<b>{result.normalizedForms[0]}</b> → <b>{result.normalizedForms[1]}</b></p> : null}
    <h2>推荐候选</h2>
    <div className="candidate-list">{result.combinationCandidates.slice(0, 5).map((candidate, index) => <article className={index === 0 ? 'candidate primary' : 'candidate'} key={`${candidate.source}-${candidate.reading}`}>
      <span>{index === 0 ? '优先' : candidate.source === 'dictionary' ? '词典' : '推测'}</span><strong>{candidate.reading}</strong><small>{candidate.romaji}</small><p>{candidate.notes.join(' · ')}</p>
    </article>)}</div>
    <h2>逐字候选结果</h2>
    <article className="candidate selected-result"><span>直拼</span><strong>{selectedReading || '—'}</strong><small>{selectedRomaji}</small><p>{selectedCandidates.map((candidate) => candidate.reading).join(' + ') || '请先选择读音'}</p></article>
    <h2>逐字读音候选</h2>
    <p className="hint">点击读音只会更新上方这一条逐字直拼结果；推荐候选保持不变。</p>
    <div className="characters">{result.characters.map((character, index) => <article key={`${character.originalChar}-${index}`}><h3>{character.originalChar}{character.normalizedChar !== character.originalChar ? <em> → {character.normalizedChar}</em> : null}</h3>{character.candidates.slice(0, 8).map((candidate) => <button type="button" className={selectedKeys[index] === candidateKey(candidate) ? 'reading selected' : 'reading'} key={`${candidate.type}-${candidate.reading}`} onClick={() => onSelect(index, candidate)}><b>{candidate.reading}</b><small>{candidate.label}</small></button>)}</article>)}</div>
  </section>;
}
