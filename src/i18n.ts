import { useEffect, useState } from 'react';

export type Locale = 'en' | 'ko';

const EN = {
  'menu.intro1': 'Pick two numbers from the pool to build the equation.',
  'menu.intro2': 'When the result matches a falling balloon, the balloon pops.',
  'menu.intro3': 'Balloons that reach the bottom take a life.',
  'menu.start': '▶ Start',
  'menu.daily': 'Daily Challenge',

  'over.victory': '🎉 All stages cleared!',
  'over.gameover': '💀 Game Over',
  'over.stageReached': 'Stages reached',
  'over.killedPassed': 'Popped · Missed',
  'over.accuracy': 'Accuracy',
  'over.finalScore': 'Final score',
  'over.formula': 'score × accuracy',
  'over.restart': 'Restart',

  'clear.heading': '✓ Stage {n} clear!',
  'clear.popped': 'Popped',
  'clear.missed': 'Missed',
  'clear.next': '▶ Go to Stage {n}',
  'clear.lastDone': 'All stages done. Restart',

  'hud.lives': 'lives',
  'hud.accuracy': 'accuracy',
  'hud.score': 'score',
  'hud.progress': 'progress',
  'hud.pause': 'Pause',
  'hud.resume': '▶ Resume',
  'stage.label': 'Stage {n} · {kind} · max {max} · {sub}',

  'kind.add': 'Addition +',
  'kind.sub': 'Subtraction −',
  'kind.mul': 'Multiplication ×',
  'kind.div': 'Division ÷',

  'eq.clear': '↺ Clear',
  'pool.refilling': 'recharging…',
  'pool.inUse': 'already used',
  'pool.tap': 'tap to add',
  'help.line1': 'Tap pool numbers to fill the equation. It auto-fires when full.',
  'help.line2': 'Tap an equation slot to remove that number.',

  'tagline': 'Math · Pop · Defend',

  'onboarding.tip': '👋 Tap or drag a number tile up into the equation. Match the result to a falling balloon.',
  'onboarding.tip.k': '👋 Tap a number below! When the answer matches the falling balloon — POP! 🎈',
  'onboarding.gotIt': 'got it',

  'pause.title': '⏸ Paused',
  'pause.resume': 'tap anywhere to resume',
  'pause.quit': '← Quit to menu',

  'game.retry': 'Retry',
  'game.leaderboard': '🏆 Leaderboard',
  'game.menuBack': '← Menu',
  'game.share': '✉ Share',
  'game.saveCard': '📥 Save card',

  'over.newBest': '🏅 NEW BEST · prev {prev}',
  'over.top10': 'Top 10 · ranked #{rank} (best {prev})',
  'over.prevBest': 'BEST · {prev}',
  'over.bestCombo': '🔥 Best combo: ×{n}',
  'over.survived': '{n}s survived',

  'ltr.heading': 'Equations solve left to right!',
  'ltr.body': 'e.g. 3 + 2 × 4 → 5 × 4 → 20',
  'ltr.note': '(no PEMDAS — left to right only)',

  'age.label': 'Age',
  'age.5-6': 'Kindergarten (5–6)',
  'age.7-9': 'Grade 1–3 (7–9)',
  'age.10-12': 'Grade 4–6 (10–12)',
  'age.5-6.short': 'K',
  'age.7-9.short': '1–3',
  'age.10-12.short': '4–6',
};

const KO: typeof EN = {
  'menu.intro1': '풀에서 숫자 두 개를 골라 식을 만들어요.',
  'menu.intro2': '결과값이 떨어지는 풍선과 같으면 풍선이 터져요.',
  'menu.intro3': '바닥에 닿은 풍선만큼 라이프가 줄어요.',
  'menu.start': '▶ 시작하기',
  'menu.daily': '데일리 챌린지',

  'over.victory': '🎉 모든 스테이지 클리어!',
  'over.gameover': '💀 게임 오버',
  'over.stageReached': '스테이지 도달',
  'over.killedPassed': '제거 · 통과',
  'over.accuracy': '정확도',
  'over.finalScore': '최종 점수',
  'over.formula': '점수 × 정확도',
  'over.restart': '다시 시작',

  'clear.heading': '✓ Stage {n} 클리어!',
  'clear.popped': '제거',
  'clear.missed': '통과',
  'clear.next': '▶ Stage {n} 가기',
  'clear.lastDone': '모든 스테이지 끝. 다시 시작',

  'hud.lives': '라이프',
  'hud.accuracy': '정확도',
  'hud.score': '점수',
  'hud.progress': '진행률',
  'hud.pause': '일시정지',
  'hud.resume': '▶ 재개',
  'stage.label': 'Stage {n} · {kind} · 최대 {max} · {sub}',

  'kind.add': '더하기 +',
  'kind.sub': '빼기 −',
  'kind.mul': '곱하기 ×',
  'kind.div': '나누기 ÷',

  'eq.clear': '↺ 식 비우기',
  'pool.refilling': '충전 중…',
  'pool.inUse': '이미 사용 중',
  'pool.tap': '탭해서 식에 넣기',
  'help.line1': '풀의 숫자를 탭해 식을 채워요. 다 차면 자동으로 발사돼요.',
  'help.line2': '식 슬롯을 다시 탭하면 그 숫자가 빠져요.',

  'tagline': 'Math · Pop · Defend',

  'onboarding.tip': '👋 숫자 타일을 탭하거나 식 위로 드래그해서 넣으세요. 결과가 떨어지는 풍선과 맞으면 풍선이 터져요.',
  'onboarding.tip.k': '👋 아래 숫자를 탭해봐! 답이 맞으면 풍선이 펑! 🎈',
  'onboarding.gotIt': '알겠어요',

  'pause.title': '⏸ 일시 정지',
  'pause.resume': '아무 곳이나 탭해서 재개',
  'pause.quit': '← 메뉴로',

  'game.retry': '다시 하기',
  'game.leaderboard': '🏆 리더보드',
  'game.menuBack': '← 메뉴',
  'game.share': '✉ 공유',
  'game.saveCard': '📥 카드 저장',

  'over.newBest': '🏅 최고 기록! · 이전 {prev}',
  'over.top10': 'Top 10 · #{rank}위 (최고 {prev})',
  'over.prevBest': '최고 · {prev}',
  'over.bestCombo': '🔥 최고 콤보: ×{n}',
  'over.survived': '{n}초 생존',

  'ltr.heading': '수식은 왼쪽부터 순서대로 풀어요!',
  'ltr.body': '예: 3 + 2 × 4 → 5 × 4 → 20',
  'ltr.note': '(× ÷ 먼저 X, 학교에서 배운 순서랑 달라요)',

  'age.label': '나이',
  'age.5-6': '유치원 (5–6세)',
  'age.7-9': '초등 저학년 (7–9세)',
  'age.10-12': '초등 고학년 (10–12세)',
  'age.5-6.short': '유치원',
  'age.7-9.short': '저학년',
  'age.10-12.short': '고학년',
};

const DICTS: Record<Locale, typeof EN> = { en: EN, ko: KO };

export type I18nKey = keyof typeof EN;
export type TFn = (key: I18nKey, params?: Record<string, string | number>) => string;

export function useT() {
  const [locale, setLocaleState] = useState<Locale>(() => {
    if (typeof window === 'undefined') return 'en';
    const saved = window.localStorage.getItem('nd_locale') as Locale | null;
    return saved === 'ko' ? 'ko' : 'en';
  });

  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem('nd_locale', locale);
    }
  }, [locale]);

  const setLocale = (l: Locale) => setLocaleState(l);
  const toggleLocale = () => setLocaleState(l => (l === 'en' ? 'ko' : 'en'));

  const t = (key: keyof typeof EN, params?: Record<string, string | number>): string => {
    let s = DICTS[locale][key] ?? EN[key] ?? (key as string);
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        s = s.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v));
      }
    }
    return s;
  };

  return { locale, setLocale, toggleLocale, t };
}
