const KANA_BASE: Record<string, string> = {
  あ: 'a', い: 'i', う: 'u', え: 'e', お: 'o',
  か: 'ka', き: 'ki', く: 'ku', け: 'ke', こ: 'ko',
  さ: 'sa', し: 'shi', す: 'su', せ: 'se', そ: 'so',
  た: 'ta', ち: 'chi', つ: 'tsu', て: 'te', と: 'to',
  な: 'na', に: 'ni', ぬ: 'nu', ね: 'ne', の: 'no',
  は: 'ha', ひ: 'hi', ふ: 'fu', へ: 'he', ほ: 'ho',
  ま: 'ma', み: 'mi', む: 'mu', め: 'me', も: 'mo',
  や: 'ya', ゆ: 'yu', よ: 'yo',
  ら: 'ra', り: 'ri', る: 'ru', れ: 're', ろ: 'ro',
  わ: 'wa', ゐ: 'wi', ゑ: 'we', を: 'o', ん: 'n',
  が: 'ga', ぎ: 'gi', ぐ: 'gu', げ: 'ge', ご: 'go',
  ざ: 'za', じ: 'ji', ず: 'zu', ぜ: 'ze', ぞ: 'zo',
  だ: 'da', ぢ: 'ji', づ: 'zu', で: 'de', ど: 'do',
  ば: 'ba', び: 'bi', ぶ: 'bu', べ: 'be', ぼ: 'bo',
  ぱ: 'pa', ぴ: 'pi', ぷ: 'pu', ぺ: 'pe', ぽ: 'po',
  ゔ: 'vu',
  ぁ: 'a', ぃ: 'i', ぅ: 'u', ぇ: 'e', ぉ: 'o',
  ゃ: 'ya', ゅ: 'yu', ょ: 'yo', ゎ: 'wa',
};

const KANA_DIGRAPHS: Record<string, string> = {
  きゃ: 'kya', きゅ: 'kyu', きょ: 'kyo',
  しゃ: 'sha', しゅ: 'shu', しょ: 'sho',
  ちゃ: 'cha', ちゅ: 'chu', ちょ: 'cho',
  にゃ: 'nya', にゅ: 'nyu', にょ: 'nyo',
  ひゃ: 'hya', ひゅ: 'hyu', ひょ: 'hyo',
  みゃ: 'mya', みゅ: 'myu', みょ: 'myo',
  りゃ: 'rya', りゅ: 'ryu', りょ: 'ryo',
  ぎゃ: 'gya', ぎゅ: 'gyu', ぎょ: 'gyo',
  じゃ: 'ja', じゅ: 'ju', じょ: 'jo',
  ぢゃ: 'ja', ぢゅ: 'ju', ぢょ: 'jo',
  びゃ: 'bya', びゅ: 'byu', びょ: 'byo',
  ぴゃ: 'pya', ぴゅ: 'pyu', ぴょ: 'pyo',
  ふぁ: 'fa', ふぃ: 'fi', ふぇ: 'fe', ふぉ: 'fo',
  うぃ: 'wi', うぇ: 'we', うぉ: 'wo',
  ゔぁ: 'va', ゔぃ: 'vi', ゔぇ: 've', ゔぉ: 'vo',
  てぃ: 'ti', とぅ: 'tu', でぃ: 'di', どぅ: 'du',
  しぇ: 'she', じぇ: 'je', ちぇ: 'che',
};

const VOWELS = new Set(['a', 'i', 'u', 'e', 'o']);

function toHiragana(input: string): string {
  return Array.from(input)
    .map((char) => {
      const code = char.charCodeAt(0);
      if (code >= 0x30a1 && code <= 0x30f6) {
        return String.fromCharCode(code - 0x60);
      }
      return char;
    })
    .join('');
}

function firstConsonant(value: string): string {
  if (!value) return '';
  if (VOWELS.has(value[0])) return '';
  if (value.startsWith('ch')) return 'c';
  if (value.startsWith('sh')) return 's';
  if (value.startsWith('ts')) return 't';
  return value[0];
}

function lastVowel(value: string): string {
  for (let i = value.length - 1; i >= 0; i -= 1) {
    if (VOWELS.has(value[i])) return value[i];
  }
  return '';
}

function applyMacrons(value: string): string {
  return value
    .replace(/ou/g, 'ō')
    .replace(/oo/g, 'ō')
    .replace(/aa/g, 'ā')
    .replace(/ii/g, 'ī')
    .replace(/uu/g, 'ū')
    .replace(/ee/g, 'ē');
}

function capitalizeRomaji(value: string): string {
  if (!value) return value;
  return `${value[0].toUpperCase()}${value.slice(1)}`;
}

export function kanaToRomaji(input: string): string {
  const kana = toHiragana(input.trim());
  let result = '';
  let doubleNext = false;

  for (let i = 0; i < kana.length; i += 1) {
    const char = kana[i];

    if (char === 'っ') {
      doubleNext = true;
      continue;
    }

    if (char === 'ー') {
      result += lastVowel(result);
      continue;
    }

    const pair = kana.slice(i, i + 2);
    let roman = KANA_DIGRAPHS[pair];
    if (roman) {
      i += 1;
    } else {
      roman = KANA_BASE[char] ?? char;
    }

    if (doubleNext) {
      result += firstConsonant(roman);
      doubleNext = false;
    }

    result += roman;
  }

  return capitalizeRomaji(applyMacrons(result.replace(/n([bmp])/g, 'm$1')));
}
