import { ZH } from './zh';
import { EN } from './en';

export type LangKey = keyof typeof ZH;

const DICTS = { zh: ZH, en: EN } as const;

let _lang: 'zh' | 'en' = (() => {
  try {
    const saved = localStorage.getItem('game_lang');
    return saved === 'en' ? 'en' : 'zh';
  } catch {
    return 'zh';
  }
})();

export function setLang(l: 'zh' | 'en'): void {
  localStorage.setItem('game_lang', l);
  location.reload();
}

export function getLang(): 'zh' | 'en' {
  return _lang;
}

export function t(key: LangKey, vars?: Record<string, string | number>): string {
  let str: string = DICTS[_lang][key] ?? DICTS['zh'][key] ?? key;
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      str = str.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v));
    }
  }
  return str;
}
