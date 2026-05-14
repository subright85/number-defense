import { useEffect, useState, useRef } from 'react';
import { loadBalance, getStage, getLeaderboard, recordScore, getNickname, setNickname, evaluate } from './game/engine';
import type { LeaderboardEntry } from './game/engine';
import { useGameLoop } from './game/useGameLoop';
import { useT, type Locale, type TFn } from './i18n';
import { Balloon, BALLOON_W, BALLOON_H, balloonVariantFor, PopBurst } from './components/Balloon';
import { PoolTile } from './components/PoolTile';
import { BackgroundLayer } from './components/BackgroundLayer';
import { playPop, playMiss, playLifeLost, playStart, playUiTap, playModalOpen, playModalClose, playComboBuild, playComboBreak, playTierUp, playGameoverSting, unlockAudio, isMuted, setMuted } from './sfx';
import type { AgeBracket, EquationKind } from './game/types';

function canDragHit(
  dragNum: number,
  equation: { op: string | null; value: number | null }[],
  enemies: { target: number }[],
  mode: EquationKind
): boolean {
  const vars = equation.filter(s => s.op === null);
  const enemyVals = new Set(enemies.map(e => e.target));
  for (let i = 0; i < vars.length; i++) {
    if (vars[i].value !== null) continue;
    const testVals = vars.map((v, j) => (j === i ? dragNum : v.value));
    if (testVals.some(v => v === null)) continue;
    const result = evaluate(testVals as number[], mode);
    if (result !== null && enemyVals.has(result)) return true;
  }
  return false;
}

function useCountUp(target: number, durationMs = 700): number {
  const [display, setDisplay] = useState(0);
  useEffect(() => {
    setDisplay(0);
    if (target === 0) return;
    const start = performance.now();
    let raf: number;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / durationMs);
      const ease = 1 - Math.pow(1 - t, 3);
      setDisplay(Math.round(ease * target));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, durationMs]);
  return display;
}

function HudIcon({ src, size = 13, opacity = 1 }: { src: string; size?: number; opacity?: number }) {
  return <img src={src} alt="" width={size} height={size} style={{ display: 'block', opacity }} draggable={false} />;
}

const LANE_HEIGHT = 460;
const LANE_WIDTH  = 320;

const ND_PRIMARY_HEX = '#FFD93D';
const MIXED_COLOR = 'var(--nd-primary)';
const MIXED_GLYPH = '∞';


export default function App() {
  const [loaded, setLoaded] = useState(false);
  const [now, setNow] = useState(Date.now());
  const { state, flashes, tankHits, splitAnims, startGame, startDaily, restart, togglePause, tap, drop, untap, submit, clear } = useGameLoop();
  const recentlyKilledRef = useRef<Map<string, number>>(new Map());
  const { locale, toggleLocale, t } = useT();
  const recordedHighScoreRef = useRef(false);
  const [latestHighScoreSnapshot, setLatestHighScoreSnapshot] = useState<{
    isNew: boolean; previous: number; rank: number | null;
  } | null>(null);
  const [showLeaderboard, setShowLeaderboard] = useState(false);
  const [showLtrBanner, setShowLtrBanner] = useState(false);
  const [muted, setMutedState] = useState<boolean>(() => isMuted());
  const [nickname, setNicknameState] = useState<string>(() => getNickname());
  const lastFlashIdRef = useRef<string | null>(null);
  const lastReachedRef = useRef<number>(0);
  const prevComboRef = useRef<number>(0);
  const [comboFloaters, setComboFloaters] = useState<{ id: number; count: number }[]>([]);
  const [laneShaking, setLaneShaking] = useState(false);
  const [drag, setDrag] = useState<{
    entryId: string; number: number;
    x: number; y: number;
    startX: number; startY: number;
    moved: boolean;
  } | null>(null);
  const slotRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const prevStageIndexRef = useRef<number>(state.stageIndex);
  const [tierToast, setTierToast] = useState<{ id: number; label: string } | null>(null);
  const [showOnboarding, setShowOnboarding] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return window.localStorage.getItem('nd_onboarded') !== '1';
  });
  const [ageBracket, setAgeBracketState] = useState<AgeBracket>(() => {
    if (typeof window === 'undefined') return '7-9';
    const stored = window.localStorage.getItem('nd_age');
    return (stored === '5-6' || stored === '7-9' || stored === '10-12') ? stored : '7-9';
  });
  const setAgeBracket = (b: AgeBracket) => {
    setAgeBracketState(b);
    if (typeof window !== 'undefined') window.localStorage.setItem('nd_age', b);
    restart(b);
  };

  const [windowWidth, setWindowWidth] = useState(() => typeof window !== 'undefined' ? window.innerWidth : 0);
  useEffect(() => {
    const h = () => setWindowWidth(window.innerWidth);
    window.addEventListener('resize', h, { passive: true });
    return () => window.removeEventListener('resize', h);
  }, []);
  const isWide = windowWidth >= 1024;

  const scoreForCountUp = state.phase === 'gameover'
    ? Math.round(state.score * (state.attempts > 0 ? state.hits / state.attempts : 0))
    : 0;
  const animatedScore = useCountUp(scoreForCountUp);

  useEffect(() => {
    loadBalance().then(() => { restart(ageBracket); setLoaded(true); });
  }, []);

  useEffect(() => {
    if (state.phase !== 'playing') return;
    const id = setInterval(() => setNow(Date.now()), 60);
    return () => clearInterval(id);
  }, [state.phase]);

  useEffect(() => {
    flashes.forEach(f => {
      if (f.enemyId) recentlyKilledRef.current.set(f.enemyId, f.ts);
    });
    const cutoff = Date.now() - 1500;
    Array.from(recentlyKilledRef.current.entries()).forEach(([k, v]) => {
      if (v < cutoff) recentlyKilledRef.current.delete(k);
    });
  }, [flashes]);

  // Auto-fire when slots filled
  useEffect(() => {
    if (state.phase !== 'playing') return;
    const allFilled = state.equation.length > 0 && state.equation.every(s => s.op !== null || s.value !== null);
    if (!allFilled) return;
    const id = setTimeout(() => submit(), 220);
    return () => clearTimeout(id);
  }, [state.equation, state.phase, submit]);

  // SFX — react to new flashes
  useEffect(() => {
    if (!flashes.length) return;
    const latest = flashes[flashes.length - 1];
    if (latest.id === lastFlashIdRef.current) return;
    lastFlashIdRef.current = latest.id;
    if (latest.kind === 'hit') playPop();
    else if (latest.kind === 'miss') playMiss();
  }, [flashes]);

  // SFX — life lost when reachedBase increments
  useEffect(() => {
    if (state.reachedBaseSoFar > lastReachedRef.current) {
      playLifeLost();
    }
    lastReachedRef.current = state.reachedBaseSoFar;
  }, [state.reachedBaseSoFar]);

  // Tier-up toast when stageIndex changes mid-play
  useEffect(() => {
    if (state.phase !== 'playing') {
      prevStageIndexRef.current = state.stageIndex;
      return;
    }
    if (state.stageIndex !== prevStageIndexRef.current) {
      const newStage = getStage(state.stageIndex);
      if (newStage) {
        playTierUp();
        const toastId = Date.now();
        setTierToast({ id: toastId, label: newStage.label });
        const t = setTimeout(() => {
          setTierToast(prev => (prev && prev.id === toastId ? null : prev));
        }, 2200);
        prevStageIndexRef.current = state.stageIndex;
        return () => clearTimeout(t);
      }
      prevStageIndexRef.current = state.stageIndex;
    }
  }, [state.stageIndex, state.phase]);

  // Combo visual effects — vignette, floater, shake
  useEffect(() => {
    const prev = prevComboRef.current;
    const curr = state.combo;
    if (curr > prev && curr >= 3) {
      if (curr === 3) playComboBuild();
      const id = Date.now();
      setComboFloaters(fs => [...fs, { id, count: curr }]);
      setTimeout(() => setComboFloaters(fs => fs.filter(f => f.id !== id)), 800);
    }
    if (prev >= 3 && curr < prev) {
      playComboBreak();
    }
    if (prev >= 2 && curr < prev) {
      setLaneShaking(true);
      setTimeout(() => setLaneShaking(false), 450);
    }
    prevComboRef.current = curr;
  }, [state.combo]);

  // Dismiss onboarding on first hit
  useEffect(() => {
    if (state.killedSoFar > 0 && showOnboarding) {
      setShowOnboarding(false);
      if (typeof window !== 'undefined') {
        window.localStorage.setItem('nd_onboarded', '1');
      }
    }
  }, [state.killedSoFar, showOnboarding]);

  // Drag pointer handlers (window-level)
  useEffect(() => {
    if (!drag) return;
    const onMove = (e: PointerEvent) => {
      setDrag(d => {
        if (!d) return null;
        const dx = e.clientX - d.startX;
        const dy = e.clientY - d.startY;
        const moved = d.moved || Math.hypot(dx, dy) > 6;
        return { ...d, x: e.clientX, y: e.clientY, moved };
      });
    };
    const onUp = (e: PointerEvent) => {
      setDrag(d => {
        if (!d) return null;
        // Hit test: which equation slot is under the pointer?
        let hitIdx: number | null = null;
        for (let i = 0; i < slotRefs.current.length; i++) {
          const ref = slotRefs.current[i];
          if (!ref) continue;
          const rect = ref.getBoundingClientRect();
          if (
            e.clientX >= rect.left && e.clientX <= rect.right &&
            e.clientY >= rect.top && e.clientY <= rect.bottom
          ) {
            hitIdx = i;
            break;
          }
        }
        if (hitIdx !== null) drop(d.entryId, hitIdx);
        else if (!d.moved) tap(d.entryId);
        return null;
      });
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
  }, [drag, drop, tap]);

  // Reset high-score recording flag whenever phase leaves gameover
  useEffect(() => {
    if (state.phase !== 'gameover') {
      recordedHighScoreRef.current = false;
      setLatestHighScoreSnapshot(null);
    }
  }, [state.phase]);

  // Show left-to-right evaluation banner on first mixed round (R8)
  useEffect(() => {
    if (state.phase === 'playing' && state.round === 8 && !showLtrBanner) {
      if (localStorage.getItem('nd:tutorial:leftToRight') !== '1') {
        setShowLtrBanner(true);
      }
    }
  }, [state.phase, state.round, showLtrBanner]);

  // Record final score on gameover + play sting
  useEffect(() => {
    if (state.phase !== 'gameover' || recordedHighScoreRef.current) return;
    recordedHighScoreRef.current = true;
    playGameoverSting();
    const accuracy = state.attempts > 0 ? state.hits / state.attempts : 0;
    const finalScore = Math.round(state.score * accuracy);
    const livePauseElapsed = state.pausedAt > 0 ? Date.now() - state.pausedAt : 0;
    const survivedSec = state.startedAt > 0
      ? Math.max(0, Math.floor((Date.now() - state.startedAt - state.pausedTotal - livePauseElapsed) / 1000))
      : 0;
    const result = recordScore(state.mode, {
      score: finalScore,
      killed: state.killedSoFar,
      accuracyPct: Math.round(accuracy * 100),
      survivedSec,
      name: nickname || undefined,
    });
    setLatestHighScoreSnapshot(result);
  }, [state.phase, state.mode, state.score, state.attempts, state.hits, state.killedSoFar, state.startedAt, state.bestCombo, state.pausedAt, state.pausedTotal, nickname]);

  if (!loaded) {
    return (
      <>
        <BackgroundLayer />
        <div style={{ ...fullCenterStyle, position: 'relative', zIndex: 1 }}>
          <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: 14 }}>Loading…</div>
        </div>
      </>
    );
  }

  const stage = getStage(state.stageIndex);

  // ── Phase: menu ─────────────────────────────────────
  if (state.phase === 'menu') {
    return (
      <>
      <BackgroundLayer />
      {isWide && <WideMenuLeft mode={state.mode} />}
      {isWide && <WideMenuRight />}
      <div style={fullCenterStyle}>
        <LocaleToggle locale={locale} onToggle={toggleLocale} />
        <MuteToggle muted={muted} onToggle={() => { unlockAudio(); const next = !muted; setMuted(next); setMutedState(next); }} />

        {/* Decorative demo balloons — brand first-impression */}
        {([
          { variant: 0, style: { left: '7%',  top: '12%' }, dur: '2.8s', delay: '0s',    opacity: 0.35, num: 7 },
          { variant: 2, style: { right: '6%', top: '18%' }, dur: '3.3s', delay: '0.5s',  opacity: 0.4,  num: 4 },
          { variant: 4, style: { left: '11%', bottom: '22%' }, dur: '2.5s', delay: '1.1s', opacity: 0.3, num: 9 },
          { variant: 1, style: { right: '9%', bottom: '18%' }, dur: '3.8s', delay: '0.3s', opacity: 0.38, num: 2 },
        ] as const).map((b, i) => (
          <div key={i} style={{
            position: 'absolute', ...b.style,
            opacity: b.opacity, pointerEvents: 'none',
            animation: `balloonBob ${b.dur} ease-in-out infinite ${b.delay}`,
            zIndex: 0,
          }}>
            <Balloon number={b.num} variant={b.variant} />
          </div>
        ))}

        <div style={{
          maxWidth: 420, width: '100%', padding: '32px 20px 24px',
          display: 'flex', flexDirection: 'column', gap: 16,
          background: 'linear-gradient(180deg, rgba(255,255,255,0.035) 0%, rgba(255,255,255,0.01) 100%)',
          borderRadius: 24,
          boxShadow: '0 8px 48px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.07)',
          border: '1px solid rgba(255,255,255,0.07)',
        }}>
          <HeroBlock taglineLabel={t('tagline')} />

          <NicknameInput
            value={nickname}
            onChange={(name) => { setNicknameState(name); setNickname(name); }}
          />

          <AgeBracketPicker
            value={ageBracket}
            onChange={(b) => { playUiTap(); setAgeBracket(b); }}
            t={t}
          />

          <div style={{
            display: 'flex', alignItems: 'center', gap: 8, marginTop: 6,
            color: 'rgba(255,255,255,0.55)', fontSize: 12, lineHeight: 1.5,
            background: 'linear-gradient(135deg, rgba(255,255,255,0.05), rgba(255,255,255,0.01))',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: 12, padding: '10px 12px',
            boxShadow: '0 2px 12px rgba(0,0,0,0.25), inset 0 1px 0 rgba(255,255,255,0.07)',
          }}>
            <span style={{ fontSize: 18 }}>🎈</span>
            <span>
              {t('menu.intro1')}{' '}{t('menu.intro2')}
            </span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <button
              onClick={() => { unlockAudio(); playStart(); startGame('add', ageBracket); }}
              style={{
                ...primaryBtn(MIXED_COLOR),
                width: '100%',
                padding: '18px 24px',
                fontSize: 18,
                borderRadius: 16,
                boxShadow: '0 6px 24px rgba(255,217,61,0.33), inset 0 1px 0 rgba(255,255,255,0.18)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
              }}
              className="nd-btn"
            >
              <span style={{ fontSize: 28, fontFamily: "'JetBrains Mono', monospace" }}>{MIXED_GLYPH}</span>
              <span>{t('menu.start')}</span>
            </button>
            <button
              onClick={() => { playUiTap(); playModalOpen(); setShowLeaderboard(true); }}
              style={{ ...secondaryBtn(), width: '100%', fontSize: 13, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
            >
              <img src="/sprites/icons/trophy.png" alt="" width={16} height={16} style={{ display: 'block' }} draggable={false} />
              {t('game.leaderboard')}
            </button>
            <button
              onClick={() => { playUiTap(); playModalOpen(); startDaily(ageBracket); }}
              style={{ ...secondaryBtn(), width: '100%', fontSize: 13, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
            >
              <img src="/sprites/icons/daily-target.png" alt="" width={16} height={16} style={{ display: 'block' }} draggable={false} />
              {t('menu.daily')}
            </button>
          </div>

        </div>
        {showLeaderboard && (
          <LeaderboardModal
            mode={state.mode}
            onClose={() => { playModalClose(); setShowLeaderboard(false); }}
          />
        )}
      </div>
      </>
    );
  }

  // ── Phase: gameover ─────────────────────────────────
  if (state.phase === 'gameover') {
    const accuracy = state.attempts > 0 ? Math.round((state.hits / state.attempts) * 100) : 0;
    const finalScore = Math.round(state.score * (state.attempts > 0 ? state.hits / state.attempts : 0));
    const livePauseElapsed = state.pausedAt > 0 ? Date.now() - state.pausedAt : 0;
    const survivedSec = state.startedAt > 0
      ? Math.max(0, Math.floor((Date.now() - state.startedAt - state.pausedTotal - livePauseElapsed) / 1000))
      : 0;
    const hsSnap = latestHighScoreSnapshot;
    return (
      <>
      <BackgroundLayer />
      <div style={fullCenterStyle}>
        <LocaleToggle locale={locale} onToggle={toggleLocale} />
        <MuteToggle muted={muted} onToggle={() => { unlockAudio(); const next = !muted; setMuted(next); setMutedState(next); }} />
        <div style={{ textAlign: 'center', maxWidth: 360, padding: 24 }}>
          <h1 style={{ fontSize: 28, margin: 0, color: 'var(--nd-accent-red)' }}>
            {t('over.gameover')}
          </h1>
          <div style={{ marginTop: 18, fontSize: 14, color: 'rgba(255,255,255,0.78)', lineHeight: 1.7 }}>
            <div>
              {`${MIXED_GLYPH} Mixed`}
              <span style={{ opacity: 0.5, margin: '0 6px' }}>·</span>
              {survivedSec}s
            </div>
            <div>{t('over.killedPassed')}: <b>{state.killedSoFar}</b> · <b>{state.reachedBaseSoFar}</b></div>
            <div>{t('over.accuracy')}: <b>{accuracy}%</b> ({state.hits}/{state.attempts})</div>
            <div>{t('over.bestCombo', { n: state.bestCombo })}</div>
            <div style={{
              marginTop: 16,
              background: 'linear-gradient(135deg, rgba(255,217,61,0.08), rgba(255,217,61,0.02))',
              border: '1px solid rgba(255,217,61,0.2)',
              borderRadius: 20,
              padding: '20px 24px 16px',
              boxShadow: '0 4px 32px rgba(255,217,61,0.12), inset 0 1px 0 rgba(255,255,255,0.08)',
            }}>
              <div style={{
                fontSize: 72, fontWeight: 900, lineHeight: 1,
                color: 'var(--nd-primary)',
                fontFamily: "'JetBrains Mono', monospace",
                textShadow: '0 0 40px rgba(255,217,61,0.6), 0 4px 24px rgba(0,0,0,0.5)',
                fontVariantNumeric: 'tabular-nums',
              }}>
                {animatedScore}
              </div>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)', marginTop: 4 }}>
                = {state.score} × {accuracy}%
              </div>
            </div>
            {hsSnap && hsSnap.isNew && (
              <div style={{
                marginTop: 8, fontSize: 12, fontWeight: 800,
                color: 'var(--nd-accent-green)',
                background: 'rgba(107,207,127,0.15)',
                border: '1px solid rgba(107,207,127,0.4)',
                borderRadius: 8, padding: '6px 12px', display: 'inline-flex', alignItems: 'center', gap: 6,
              }}>
                <img src="/sprites/icons/new-badge.png" alt="" width={14} height={14} style={{ display: 'block' }} draggable={false} />
                {t('over.newBest', { prev: hsSnap.previous })}
              </div>
            )}
            {hsSnap && !hsSnap.isNew && hsSnap.rank && (
              <div style={{ marginTop: 6, fontSize: 11, color: 'var(--nd-primary)', fontWeight: 700 }}>
                {t('over.top10', { rank: hsSnap.rank, prev: hsSnap.previous })}
              </div>
            )}
            {hsSnap && !hsSnap.isNew && !hsSnap.rank && (
              <div style={{ marginTop: 6, fontSize: 11, color: 'rgba(255,255,255,0.55)' }}>
                {t('over.prevBest', { prev: hsSnap.previous })}
              </div>
            )}
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginTop: 22, flexWrap: 'wrap' }}>
            <button
              onClick={() => { unlockAudio(); playUiTap(); playStart(); startGame('add', ageBracket); }}
              style={{ ...primaryBtn(MIXED_COLOR), display: 'inline-flex', alignItems: 'center', gap: 8 }}
            >
              <img src="/sprites/icons/retry.png" alt="" width={18} height={18} style={{ display: 'block' }} draggable={false} />
              {t('game.retry')}
            </button>
            <button
              onClick={() => shareScore({
                mode: state.mode,
                glyph: MIXED_GLYPH,
                score: finalScore,
                killed: state.killedSoFar,
                accuracy,
                survivedSec,
              })}
              style={secondaryBtn()}
            >
              {t('game.share')}
            </button>
            <button
              onClick={() => downloadScoreCard({
                mode: state.mode,
                glyph: MIXED_GLYPH,
                color: ND_PRIMARY_HEX,
                score: finalScore,
                killed: state.killedSoFar,
                accuracy,
                survivedSec,
                nickname,
              })}
              style={secondaryBtn()}
            >
              {t('game.saveCard')}
            </button>
            <button onClick={() => { playUiTap(); playModalOpen(); setShowLeaderboard(true); }} style={secondaryBtn()}>
              {t('game.leaderboard')}
            </button>
            <button onClick={() => { playUiTap(); restart(); }} style={secondaryBtn()}>
              {t('game.menuBack')}
            </button>
          </div>
          <DonationFooter />
        </div>
        {showLeaderboard && (
          <LeaderboardModal
            mode={state.mode}
            onClose={() => { playModalClose(); setShowLeaderboard(false); }}
          />
        )}
      </div>
      </>
    );
  }

  // ── Phase: playing ──────────────────────────────────
  if (!stage) return null;
  const accuracy = state.attempts > 0 ? Math.round((state.hits / state.attempts) * 100) : 100;
  const survivedSec = state.startedAt > 0 ? Math.floor((Date.now() - state.startedAt) / 1000) : 0;

  return (
    <>
    <BackgroundLayer />
    {isWide && <WideGameLeft state={state} />}
    {isWide && <WideGameRight state={state} />}

    {/* Combo vignette — orange/red edge glow proportional to combo */}
    {state.combo >= 3 && (
      <div style={{
        position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 0,
        background: `radial-gradient(ellipse at center, transparent 35%, rgba(249,115,22,${Math.min(state.combo * 0.045, 0.38).toFixed(2)}) 100%)`,
        transition: 'opacity 0.4s ease',
      }} />
    )}

    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      minHeight: '100vh', padding: '12px 12px 18px', gap: 10,
      position: 'relative', zIndex: 1,
    }}>
      <LocaleToggle locale={locale} onToggle={toggleLocale} />
      <Title small taglineLabel={t('tagline')} />
      {/* HUD glass bar — Sanji 권장 A+B hybrid (단일 컨테이너 + 그룹화 + 2색 강조) */}
      <div style={{
        display: 'inline-flex',
        alignItems: 'center',
        background: 'rgba(255,255,255,0.05)',
        border: '1px solid rgba(255,255,255,0.1)',
        borderRadius: 999,
        padding: '5px 14px',
        boxShadow: '0 2px 12px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.07)',
      }}>
        {/* G1: lives — 유일한 항상-색 강조 */}
        <StatItem icon={<HudIcon src="/sprites/icons/heart.png" />} value={state.lives} color="var(--nd-accent-red)" bold />
        <Sep />
        {/* G2: score + accuracy — score는 mono primary 톤, accuracy는 muted */}
        <StatItem icon={<HudIcon src="/sprites/icons/star.png" opacity={0.9} />} value={state.score} color="rgba(255,255,255,0.9)" mono />
        <StatItem icon={<HudIcon src="/sprites/icons/target.png" opacity={0.65} />} value={`${accuracy}%`} color="rgba(255,255,255,0.65)" />
        <Sep />
        {/* G3: kills + timer — muted */}
        <StatItem icon={<HudIcon src="/sprites/icons/balloon-icon.png" opacity={0.55} />} value={state.killedSoFar} color="rgba(255,255,255,0.55)" />
        <StatItem icon={<HudIcon src="/sprites/icons/timer.png" opacity={0.55} />} value={`${survivedSec}s`} color="rgba(255,255,255,0.55)" />
        {/* combo — 2 이상일 때만 */}
        {state.combo >= 2 && (
          <>
            <Sep />
            <StatItem icon={<HudIcon src="/sprites/icons/flame.png" />} value={`×${state.combo}`} color="var(--nd-accent-orange)" bold />
          </>
        )}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{
          fontSize: 12, color: 'rgba(255,255,255,0.85)',
          background: 'rgba(255,255,255,0.04)',
          border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: 999, padding: '4px 14px',
        }}>
          {stage.label} · max {stage.numberMax}
        </div>
        <button
          onClick={() => { playUiTap(); state.phase === 'playing' ? playModalOpen() : playModalClose(); togglePause(); }}
          style={{
            background: 'rgba(255,255,255,0.06)',
            border: '1px solid rgba(255,255,255,0.18)',
            color: 'white',
            padding: '4px 10px',
            borderRadius: 999,
            fontSize: 12,
            fontWeight: 700,
            cursor: 'pointer',
            display: 'inline-flex', alignItems: 'center', gap: 5,
            minHeight: 44,
          }}
        >
          {state.phase === 'paused'
            ? t('hud.resume')
            : <><img src="/sprites/icons/pause.png" alt="" width={12} height={12} style={{ display: 'block' }} draggable={false} />{t('hud.pause')}</>}
        </button>
      </div>

      {showLtrBanner && (
        <LtrBanner
          heading={t('ltr.heading')}
          body={t('ltr.body')}
          note={t('ltr.note')}
          onClose={() => {
          localStorage.setItem('nd:tutorial:leftToRight', '1');
          setShowLtrBanner(false);
        }} />
      )}

      {/* Falling lane */}
      <div style={{
        position: 'relative',
        width: LANE_WIDTH,
        height: LANE_HEIGHT,
        background:
          'linear-gradient(180deg, rgba(78,205,196,0.10) 0%, rgba(78,205,196,0.02) 30%, rgba(0,0,0,0) 100%)',
        border: '1px solid rgba(255,255,255,0.08)',
        borderBottom: '3px solid var(--nd-accent-red)',
        borderRadius: 16,
        overflow: 'hidden',
        boxShadow: '0 4px 24px rgba(0,0,0,0.5), inset 0 0 30px rgba(255,255,255,0.02)',
        animation: laneShaking ? 'comboShake 0.45s ease-out' : 'none',
      }}>
        {/* Combo floaters */}
        {comboFloaters.map(f => (
          <div
            key={f.id}
            className="nd-combo-floater"
            style={{ left: '50%', top: '30%', transform: 'translateX(-50%)' }}
          >
            🔥 ×{f.count} 콤보!
          </div>
        ))}
        <div style={{
          position: 'absolute', left: '50%', top: 0, bottom: 0,
          width: 1, background: 'rgba(255,255,255,0.04)',
          transform: 'translateX(-50%)',
        }} />

        {state.enemies.map(e => {
          const elapsed = Math.max(0, now - e.spawnedAt);
          const progress = Math.min(1, elapsed / e.fallDurationMs);
          const top = progress * (LANE_HEIGHT - BALLOON_H - 4);
          const hashH = (function(){let h=0;for(let i=0;i<e.id.length;i++)h=((h<<5)-h+e.id.charCodeAt(i))|0;return Math.abs(h);})();
          const xJitter = (hashH % 5) * 22 - 44;
          const left = LANE_WIDTH / 2 - BALLOON_W / 2 + xJitter;
          const danger = progress > 0.7;
          const shieldGlyph: Record<string, string> = { add: '+', sub: '−', mul: '×', div: '÷' };
          const isTankHit = e.kind === 'tank' && tankHits.has(e.id);
          return (
            <div
              key={e.id}
              style={{
                position: 'absolute', left, top,
                width: BALLOON_W, height: BALLOON_H,
                transition: 'top 80ms linear',
                transform: e.kind === 'tank' ? 'scale(1.2)' : e.kind === 'fast' ? 'scale(0.9)' : undefined,
                transformOrigin: 'center',
                animation: isTankHit ? 'tankHitShake 0.14s ease-out' : undefined,
              }}
            >
              {e.kind === 'fast' && [0, 1, 2].map(i => (
                <div key={i} style={{
                  position: 'absolute', inset: 0, borderRadius: '50%',
                  background: 'rgba(255,255,255,0.12)',
                  filter: 'blur(3px)',
                  transform: `translateY(${-(i + 1) * 7}px) scale(${1 - (i + 1) * 0.1})`,
                  opacity: 0.4 - i * 0.12,
                  pointerEvents: 'none',
                }} />
              ))}
              <Balloon number={e.target} variant={balloonVariantFor(e.id)} danger={danger} />
              {e.kind === 'tank' && (
                <div style={{
                  position: 'absolute', inset: -4, borderRadius: 16,
                  border: isTankHit ? '3px solid rgba(239,68,68,0.9)' : '3px solid rgba(15,23,42,0.75)',
                  boxShadow: isTankHit ? '0 0 14px rgba(239,68,68,0.55)' : '0 0 6px rgba(0,0,0,0.45)',
                  transition: 'border-color 0.06s, box-shadow 0.06s',
                  pointerEvents: 'none',
                }} />
              )}
              {e.kind === 'splitter' && (
                <div style={{
                  position: 'absolute', inset: -5, borderRadius: 18,
                  border: '2px dashed rgba(250,204,21,0.75)',
                  boxShadow: '0 0 8px rgba(250,204,21,0.3)',
                  pointerEvents: 'none',
                }} />
              )}
              {e.kind === 'shielded' && (
                <>
                  <div style={{
                    position: 'absolute',
                    inset: -6, borderRadius: '50%',
                    border: '2px dashed rgba(148,163,184,0.8)',
                    boxShadow: '0 0 10px rgba(148,163,184,0.45)',
                    animation: 'shieldSpin 3s linear infinite',
                    pointerEvents: 'none',
                  }} />
                  {e.shieldOp && (
                    <div style={{
                      position: 'absolute', top: -5, right: -5,
                      width: 20, height: 20, borderRadius: '50%',
                      background: 'rgba(15,23,42,0.95)',
                      border: '1.5px solid rgba(148,163,184,0.85)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 11, fontWeight: 900, color: '#94a3b8',
                      fontFamily: "'JetBrains Mono', monospace",
                      pointerEvents: 'none', zIndex: 2,
                    }}>
                      {shieldGlyph[e.shieldOp] ?? '?'}
                    </div>
                  )}
                </>
              )}
            </div>
          );
        })}

        {/* Splitter death — two ghost balloons fly apart */}
        {splitAnims.map(a => {
          const splitTop = a.progress * (LANE_HEIGHT - BALLOON_H - 4);
          const splitLeft = LANE_WIDTH / 2 - BALLOON_W / 2;
          return (
            <div key={a.id} style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
              {(['splitFlyLeft', 'splitFlyRight'] as const).map(anim => (
                <div key={anim} style={{
                  position: 'absolute', left: splitLeft, top: splitTop,
                  width: BALLOON_W, height: BALLOON_H,
                  animation: `${anim} 0.35s ease-out forwards`,
                  opacity: 0.75,
                }}>
                  <Balloon number={0} variant={3} />
                </div>
              ))}
            </div>
          );
        })}

        {/* Projectile that flies from base to balloon, then sprite pop */}
        {flashes.filter(f => f.kind === 'hit' && f.enemyId && f.enemyProgress !== undefined).map(f => {
          const hashH = (function(){let h=0;const id=f.enemyId!;for(let i=0;i<id.length;i++)h=((h<<5)-h+id.charCodeAt(i))|0;return Math.abs(h);})();
          const xJitter = (hashH % 5) * 22 - 44;
          const cx = LANE_WIDTH / 2 + xJitter;
          const cy = (f.enemyProgress ?? 0) * (LANE_HEIGHT - BALLOON_H - 4) + BALLOON_H / 3;
          const fromX = LANE_WIDTH / 2;
          const fromY = LANE_HEIGHT - 18;
          return (
            <ProjectileShot
              key={`shot-${f.id}`}
              fromX={fromX} fromY={fromY}
              toX={cx} toY={cy}
              value={f.result ?? null}
              ghostNumber={f.result ?? undefined}
              ghostVariant={f.enemyId ? balloonVariantFor(f.enemyId) : undefined}
            />
          );
        })}

        {flashes.map(f => (
          <div
            key={f.id}
            style={{
              position: 'absolute',
              left: '50%', top: '40%',
              transform: 'translate(-50%, -50%)',
              padding: '6px 14px',
              borderRadius: 12,
              background: f.kind === 'hit' ? 'rgba(34,197,94,0.85)' : 'rgba(239,68,68,0.6)',
              color: 'white', fontWeight: 800, fontSize: 18,
              fontFamily: "'JetBrains Mono', monospace",
              boxShadow: f.kind === 'hit' ? '0 0 24px rgba(34,197,94,0.8)' : 'none',
              animation: 'flashPop 800ms ease-out forwards',
              pointerEvents: 'none',
            }}
          >
            {f.text}
          </div>
        ))}

        <div style={{
          position: 'absolute', left: 0, right: 0, bottom: 0,
          height: 18,
          background: 'linear-gradient(180deg, rgba(239,68,68,0) 0%, rgba(239,68,68,0.35) 100%)',
          borderTop: '1px dashed rgba(239,68,68,0.4)',
          pointerEvents: 'none',
        }} />
      </div>

      {/* Equation builder */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        background: 'rgba(255,255,255,0.04)',
        border: '1px solid rgba(255,255,255,0.1)',
        borderRadius: 14,
        padding: '10px 14px',
        boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
      }}>
        {state.equation.map((slot, i) => {
          if (slot.op !== null) {
            return (
              <span key={i} style={{ fontSize: 22, fontWeight: 800, color: 'rgba(255,255,255,0.7)' }}>
                {slot.op}
              </span>
            );
          }
          const isHoverDrop = !!drag && drag.moved;
          return (
            <button
              key={i}
              ref={(el) => { slotRefs.current[i] = el; }}
              onClick={() => slot.value !== null && untap(i)}
              disabled={slot.value === null && !isHoverDrop}
              style={{
                width: 48, height: 48,
                borderRadius: 10,
                background: slot.value !== null
                  ? 'linear-gradient(135deg, #A78BFA, #7c3aed)'
                  : isHoverDrop
                    ? 'rgba(167,139,250,0.18)'
                    : 'rgba(255,255,255,0.04)',
                border: slot.value !== null
                  ? '1.5px solid var(--nd-accent-purple)'
                  : isHoverDrop
                    ? '2px dashed var(--nd-accent-purple)'
                    : '1.5px dashed rgba(255,255,255,0.25)',
                fontSize: 18, fontWeight: 800,
                color: 'white',
                cursor: slot.value !== null ? 'pointer' : 'default',
                fontFamily: "'JetBrains Mono', monospace",
                boxShadow: slot.value !== null ? '0 2px 6px rgba(167,139,250,0.5)' : 'none',
                transition: 'background 100ms, border 100ms',
              }}
            >
              {slot.value ?? '?'}
            </button>
          );
        })}
        <span style={{ fontSize: 22, fontWeight: 800, color: 'rgba(255,255,255,0.7)' }}>=</span>
        {(() => {
          const filledValues = state.equation.filter(s => s.value !== null).map(s => s.value as number);
          const allFilled = state.equation.length > 0 && state.equation.every(s => s.op !== null || s.value !== null);
          if (filledValues.length === 0) {
            return <span style={{ fontSize: 22, fontWeight: 800, color: 'rgba(255,255,255,0.3)', fontFamily: "'JetBrains Mono', monospace" }}>?</span>;
          }
          const liveVal = evaluate(filledValues, state.mode);
          const matchesEnemy = liveVal !== null && state.enemies.some(e => e.target === liveVal);
          const color = allFilled ? (matchesEnemy ? '#34d399' : '#ef4444') : '#fbbf24';
          return (
            <span style={{
              fontSize: 22, fontWeight: 800,
              color,
              fontFamily: "'JetBrains Mono', monospace",
              transition: 'color 120ms',
              textShadow: allFilled && matchesEnemy ? '0 0 10px rgba(52,211,153,0.7)' : 'none',
            }}>
              {liveVal ?? '?'}
            </span>
          );
        })()}
      </div>

      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={clear} style={secondaryBtn()}>{t('eq.clear')}</button>
      </div>

      {/* Pool — 모바일: pool>5면 2행 wrap, 데스크탑: 1행 유지 */}
      {(() => {
        const poolLen = state.pool.length;
        const cols = isWide || poolLen <= 5 ? poolLen : Math.ceil(poolLen / 2);
        return (
      <div style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${cols}, 60px)`,
        gap: 8,
        padding: 10,
        background: 'rgba(255,255,255,0.03)',
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: 14,
        justifyContent: 'center',
      }}>
        {state.pool.map((p, idx) => {
          const isRefilling = !!p.refillingUntilMs && p.refillingUntilMs > now;
          const remainingMs = isRefilling ? Math.max(0, (p.refillingUntilMs ?? 0) - now) : 0;
          const refillFrac = isRefilling ? 1 - remainingMs / 500 : 1;
          const inUse = state.equation.some(slot => slot.poolEntryId === p.id);
          return (
            <PoolTile
              key={p.id}
              number={p.number}
              isRefilling={isRefilling}
              refillFrac={refillFrac}
              inUse={inUse}
              onPress={(x, y) => {
                unlockAudio();
                setDrag({ entryId: p.id, number: p.number, x, y, startX: x, startY: y, moved: false });
              }}
              ghost={!!drag && drag.entryId === p.id}
              index={idx}
              title={isRefilling ? t('pool.refilling') : inUse ? t('pool.inUse') : t('pool.tap')}
            />
          );
        })}
      </div>
        );
      })()}

      <div style={{
        fontSize: 11, color: 'rgba(255,255,255,0.45)',
        maxWidth: 360, textAlign: 'center', lineHeight: 1.5,
      }}>
        {t('help.line1')}
        <br />{t('help.line2')}
      </div>
    </div>
    {tierToast && (
      <div
        style={{
          position: 'fixed',
          top: '18%', left: '50%',
          transform: 'translate(-50%, 0)',
          zIndex: 240,
          background: 'linear-gradient(135deg, #fde047 0%, #f59e0b 100%)',
          color: '#1f2937',
          padding: '10px 20px',
          borderRadius: 14,
          fontSize: 14, fontWeight: 800,
          letterSpacing: '0.02em',
          boxShadow: '0 10px 30px rgba(245,158,11,0.55)',
          border: '1.5px solid #d97706',
          pointerEvents: 'none',
          animation: 'tierUpPop 2200ms ease-out forwards',
        }}
      >
        🆙 {tierToast.label}
      </div>
    )}
    {showOnboarding && state.phase === 'playing' && state.killedSoFar === 0 && (
      <div
        style={{
          position: 'fixed',
          right: 16, bottom: 16,
          zIndex: 220,
          maxWidth: 240,
          background: 'rgba(78, 205, 196, 0.95)',
          color: 'white',
          padding: '10px 14px',
          borderRadius: 14,
          fontSize: 12, fontWeight: 700,
          lineHeight: 1.5,
          boxShadow: '0 8px 24px rgba(78,205,196,0.5)',
          border: '1px solid rgba(255,255,255,0.18)',
        }}
      >
        {ageBracket === '5-6' ? t('onboarding.tip.k') : t('onboarding.tip')}
        <button
          onClick={() => {
            setShowOnboarding(false);
            if (typeof window !== 'undefined') window.localStorage.setItem('nd_onboarded', '1');
          }}
          style={{
            marginTop: 8, fontSize: 13,
            background: 'rgba(255,255,255,0.18)',
            border: 'none', color: 'white',
            padding: '8px 16px', borderRadius: 999,
            fontWeight: 700, cursor: 'pointer',
            minHeight: 44,
          }}
        >
          {t('onboarding.gotIt')}
        </button>
      </div>
    )}
    {state.phase === 'paused' && (
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Game paused"
        onClick={() => { playModalClose(); togglePause(); }}
        style={{
          position: 'fixed', inset: 0, zIndex: 250,
          background: 'rgba(2, 4, 18, 0.65)',
          backdropFilter: 'blur(8px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexDirection: 'column', gap: 16,
          cursor: 'pointer',
        }}
      >
        <div style={{
          fontSize: 32, fontWeight: 800, color: 'white',
          background: 'linear-gradient(90deg, var(--nd-primary), var(--nd-accent-orange), var(--nd-accent-red))',
          WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
          backgroundClip: 'text',
        }}>
          {t('pause.title')}
        </div>
        <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.65)' }}>
          {t('pause.resume')}
        </div>
        <button
          onClick={(e) => { e.stopPropagation(); playUiTap(); restart(); }}
          style={{ ...secondaryBtn(), marginTop: 12 }}
        >
          {t('pause.quit')}
        </button>
      </div>
    )}
    {drag && drag.moved && (() => {
      const hint = canDragHit(drag.number, state.equation, state.enemies, state.mode);
      return (
        <div
          style={{
            position: 'fixed',
            left: drag.x - 30, top: drag.y - 30,
            width: 60, height: 60,
            borderRadius: 14,
            background: hint
              ? 'linear-gradient(150deg, #d1fae5 0%, #34d399 100%)'
              : 'linear-gradient(150deg, #fef3c7 0%, #fbbf24 100%)',
            border: hint ? '2px solid #059669' : '2px solid #d97706',
            boxShadow: hint
              ? '0 8px 22px rgba(52,211,153,0.75), 0 0 0 3px rgba(52,211,153,0.25)'
              : '0 8px 22px rgba(217,119,6,0.7)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 22, fontWeight: 900,
            color: hint ? '#064e3b' : '#1f2937',
            fontFamily: "'JetBrains Mono', monospace",
            zIndex: 300,
            pointerEvents: 'none',
            transform: 'scale(1.08)',
            transition: 'background 0.15s, border 0.15s, box-shadow 0.15s',
          }}
        >
          {drag.number}
        </div>
      );
    })()}
    </>
  );
}

const fullCenterStyle: React.CSSProperties = {
  display: 'flex', flexDirection: 'column',
  alignItems: 'center', justifyContent: 'center',
  minHeight: '100vh', padding: 16,
  position: 'relative', zIndex: 1,
};

function Title({ small, taglineLabel }: { small?: boolean; taglineLabel?: string }) {
  return (
    <div style={{ textAlign: 'center' }}>
      <h1 style={{
        margin: 0,
        fontSize: small ? 18 : 28,
        fontWeight: 800,
        letterSpacing: '-0.02em',
        background: 'linear-gradient(90deg, #fbbf24, #f97316, #ef4444)',
        WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
        backgroundClip: 'text',
      }}>
        Number Defense
      </h1>
      {!small && (
        <div style={{
          fontSize: 11, color: 'rgba(255,255,255,0.45)',
          letterSpacing: '0.04em', textTransform: 'uppercase', marginTop: 4,
        }}>
          {taglineLabel ?? 'Math · Pop · Defend'}
        </div>
      )}
    </div>
  );
}

function LocaleToggle({ locale, onToggle }: { locale: Locale; onToggle: () => void }) {
  return (
    <button
      onClick={onToggle}
      style={{
        position: 'fixed',
        top: 12, right: 12,
        zIndex: 100,
        background: 'rgba(255,255,255,0.06)',
        border: '1px solid rgba(255,255,255,0.18)',
        color: 'rgba(255,255,255,0.85)',
        padding: '4px 10px',
        borderRadius: 999,
        fontSize: 11,
        fontWeight: 700,
        letterSpacing: '0.04em',
        cursor: 'pointer',
        backdropFilter: 'blur(6px)',
        minWidth: 44,
        minHeight: 44,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
      title="Toggle language"
    >
      {locale === 'en' ? 'EN → KO' : '한 → EN'}
    </button>
  );
}

function MuteToggle({ muted, onToggle }: { muted: boolean; onToggle: () => void }) {
  return (
    <button
      onClick={onToggle}
      style={{
        position: 'fixed',
        top: 12, left: 12,
        zIndex: 100,
        background: 'rgba(255,255,255,0.06)',
        border: '1px solid rgba(255,255,255,0.18)',
        color: 'rgba(255,255,255,0.85)',
        padding: '4px 10px',
        borderRadius: 999,
        fontSize: 14,
        cursor: 'pointer',
        backdropFilter: 'blur(6px)',
        minWidth: 44,
        minHeight: 44,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
      title={muted ? 'Unmute' : 'Mute'}
    >
      <img
        src={muted ? '/sprites/icons/mute-on.png' : '/sprites/icons/mute-off.png'}
        alt={muted ? 'muted' : 'sound on'}
        width={16} height={16}
        style={{ display: 'block' }}
        draggable={false}
      />
    </button>
  );
}

function StatItem({
  icon, value, color, bold = false, mono = false,
}: {
  icon: React.ReactNode; value: string | number; color: string; bold?: boolean; mono?: boolean;
}) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      padding: '0 6px',
      fontSize: bold ? 15 : 13,
      fontWeight: bold ? 800 : 700,
      color,
      fontVariantNumeric: 'tabular-nums',
      fontFamily: mono ? "'JetBrains Mono', monospace" : 'inherit',
    }}>
      <span aria-hidden style={{ display: 'flex', alignItems: 'center' }}>{icon}</span>
      <span>{value}</span>
    </span>
  );
}

function Sep() {
  return <div aria-hidden style={{ width: 1, height: 16, background: 'rgba(255,255,255,0.1)', margin: '0 6px' }} />;
}

const WIDE_PANEL_STYLE: React.CSSProperties = {
  position: 'fixed', top: 0, width: 220, height: '100vh',
  padding: '80px 14px 24px',
  display: 'flex', flexDirection: 'column', gap: 12,
  overflowY: 'auto',
  zIndex: 1,
  background: 'linear-gradient(180deg, rgba(10,10,26,0.88) 0%, rgba(14,14,40,0.78) 100%)',
  backdropFilter: 'blur(12px)',
  borderColor: 'rgba(255,255,255,0.08)',
  boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.05), 0 0 40px rgba(0,0,0,0.3)',
};

function WideMenuLeft({ mode }: { mode: EquationKind }) {
  const entries = getLeaderboard(mode).slice(0, 5);
  return (
    <div style={{ ...WIDE_PANEL_STYLE, left: 0, borderRight: '1px solid rgba(255,255,255,0.06)' }}>
      <div style={{ fontSize: 11, fontWeight: 800, color: 'rgba(255,255,255,0.4)', letterSpacing: 1, textTransform: 'uppercase', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
        <img src="/sprites/icons/trophy.png" alt="" width={12} height={12} style={{ display: 'block' }} draggable={false} />Top Scores
      </div>
      {entries.length === 0 && (
        <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)' }}>No scores yet</div>
      )}
      {entries.map((e, i) => (
        <div key={i} style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '8px 10px', borderRadius: 10,
          background: i === 0 ? 'rgba(255,217,61,0.08)' : 'rgba(255,255,255,0.03)',
          border: `1px solid ${i === 0 ? 'rgba(255,217,61,0.2)' : 'rgba(255,255,255,0.06)'}`,
        }}>
          <span style={{ fontSize: 13, fontWeight: 900, color: i === 0 ? 'var(--nd-primary)' : 'rgba(255,255,255,0.45)', width: 18 }}>
            {i + 1}
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--nd-text-primary)', fontFamily: "'JetBrains Mono', monospace" }}>
              {e.score}
            </div>
            {e.name && (
              <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {e.name}
              </div>
            )}
          </div>
          <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', textAlign: 'right' }}>
            {e.accuracyPct}%<br />{e.survivedSec}s
          </div>
        </div>
      ))}
    </div>
  );
}

function WideMenuRight() {
  return (
    <div style={{ ...WIDE_PANEL_STYLE, right: 0, borderLeft: '1px solid rgba(255,255,255,0.06)' }}>
      <div style={{ fontSize: 11, fontWeight: 800, color: 'rgba(255,255,255,0.4)', letterSpacing: 1, textTransform: 'uppercase' }}>
        💡 How to Play
      </div>
      {[
        { icon: '🎈', text: 'Balloons fall — match their number' },
        { icon: '🔢', text: 'Tap number tiles to fill the equation' },
        { icon: '✅', text: 'Submit when all slots are filled' },
        { icon: '🔥', text: 'Hit 3 in a row for a combo bonus' },
        { icon: '🛡️', text: 'Shielded balloons need the right op' },
      ].map(({ icon, text }) => (
        <div key={icon} style={{
          display: 'flex', gap: 8, alignItems: 'flex-start',
          fontSize: 12, color: 'rgba(255,255,255,0.65)', lineHeight: 1.5,
        }}>
          <span style={{ flexShrink: 0 }}>{icon}</span>
          <span>{text}</span>
        </div>
      ))}
    </div>
  );
}

function WideGameLeft({ state }: { state: import('./game/types').GameState }) {
  const acc = state.attempts > 0 ? Math.round((state.hits / state.attempts) * 100) : 0;
  return (
    <div style={{ ...WIDE_PANEL_STYLE, left: 0, borderRight: '1px solid rgba(255,255,255,0.06)' }}>
      <div style={{ fontSize: 11, fontWeight: 800, color: 'rgba(255,255,255,0.4)', letterSpacing: 1, textTransform: 'uppercase', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
        <img src="/sprites/icons/share.png" alt="" width={12} height={12} style={{ display: 'block' }} draggable={false} />Stats
      </div>
      {([
        { label: 'Score',    value: state.score,       color: 'var(--nd-primary)' },
        { label: 'Accuracy', value: `${acc}%`,         color: 'var(--nd-accent-green)' },
        { label: 'Killed',   value: state.killedSoFar, color: 'var(--nd-accent-blue)' },
        { label: 'Lives',    value: state.lives,       color: 'var(--nd-accent-red)' },
        { label: 'Best ×',   value: state.bestCombo,   color: 'var(--nd-accent-orange)' },
      ] as const).map(({ label, value, color }) => (
        <div key={label} style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '7px 10px', borderRadius: 8,
          background: 'linear-gradient(135deg, rgba(255,255,255,0.05), rgba(255,255,255,0.01))',
          border: '1px solid rgba(255,255,255,0.07)',
          boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.05)',
        }}>
          <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)' }}>{label}</span>
          <span style={{ fontSize: 14, fontWeight: 900, color, fontFamily: "'JetBrains Mono', monospace" }}>{value}</span>
        </div>
      ))}
    </div>
  );
}

function WideGameRight({ state }: { state: import('./game/types').GameState }) {
  const stage = getStage(state.stageIndex);
  return (
    <div style={{ ...WIDE_PANEL_STYLE, right: 0, borderLeft: '1px solid rgba(255,255,255,0.06)' }}>
      <div style={{ fontSize: 11, fontWeight: 800, color: 'rgba(255,255,255,0.4)', letterSpacing: 1, textTransform: 'uppercase' }}>
        🌊 Wave
      </div>
      <div style={{
        padding: '10px 12px', borderRadius: 10,
        background: 'rgba(255,255,255,0.03)',
        border: '1px solid rgba(255,255,255,0.06)',
        display: 'flex', flexDirection: 'column', gap: 4,
      }}>
        <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>Stage</div>
        <div style={{ fontSize: 16, fontWeight: 900, color: 'var(--nd-accent-purple)' }}>
          {stage?.label ?? '—'}
        </div>
      </div>
      <div style={{
        padding: '10px 12px', borderRadius: 10,
        background: 'rgba(255,255,255,0.03)',
        border: '1px solid rgba(255,255,255,0.06)',
        display: 'flex', flexDirection: 'column', gap: 4,
      }}>
        <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>Enemies on screen</div>
        <div style={{ fontSize: 22, fontWeight: 900, color: 'var(--nd-accent-red)', fontFamily: "'JetBrains Mono', monospace" }}>
          {state.enemies.length}
        </div>
      </div>
      <div style={{
        padding: '10px 12px', borderRadius: 10,
        background: 'rgba(255,255,255,0.03)',
        border: '1px solid rgba(255,255,255,0.06)',
        display: 'flex', flexDirection: 'column', gap: 4,
      }}>
        <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>Combo</div>
        <div style={{ fontSize: 22, fontWeight: 900, color: 'var(--nd-accent-orange)', fontFamily: "'JetBrains Mono', monospace" }}>
          ×{state.combo}
        </div>
      </div>
    </div>
  );
}

function primaryBtn(color: string): React.CSSProperties {
  const shadow = color.startsWith('var(')
    ? `0 3px 10px color-mix(in srgb, ${color} 40%, transparent)`
    : `0 3px 10px ${color}66`;
  return {
    background: color,
    border: 'none',
    color: 'white',
    padding: '8px 18px',
    borderRadius: 10,
    fontSize: 14,
    fontWeight: 800,
    cursor: 'pointer',
    boxShadow: shadow,
    minHeight: 44,
  };
}

function LeaderboardModal({
  mode, onClose,
}: { mode: EquationKind; onClose: () => void }) {
  const entries = getLeaderboard(mode);
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => { closeRef.current?.focus(); }, []);
  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 200,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'rgba(2, 4, 18, 0.7)', backdropFilter: 'blur(6px)',
        padding: 20,
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="lb-title"
        onClick={(e) => e.stopPropagation()}
        style={{
          maxWidth: 360, width: '100%',
          background: 'linear-gradient(180deg, #14143a 0%, #0a0a1f 100%)',
          border: '1px solid rgba(255,255,255,0.12)',
          borderRadius: 16,
          padding: 18,
          boxShadow: '0 14px 50px rgba(0,0,0,0.6)',
        }}
      >
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          marginBottom: 12,
        }}>
          <div id="lb-title" style={{ fontSize: 18, fontWeight: 800, display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            <img src="/sprites/icons/trophy.png" alt="" width={20} height={20} style={{ display: 'block' }} draggable={false} />
            Top 10 · {MIXED_GLYPH} Mixed
          </div>
          <button ref={closeRef} onClick={onClose} style={{
            background: 'transparent', border: 'none',
            color: 'rgba(255,255,255,0.6)', fontSize: 18, cursor: 'pointer',
            minWidth: 44, minHeight: 44,
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          }}>×</button>
        </div>
        {entries.length === 0 ? (
          <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 13, padding: '24px 0', textAlign: 'center' }}>
            No scores yet. Be the first.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <div style={{
              display: 'grid', gridTemplateColumns: '28px 1.2fr 60px 60px 50px',
              gap: 4,
              fontSize: 10, color: 'rgba(255,255,255,0.4)',
              padding: '4px 8px', textTransform: 'uppercase', letterSpacing: '0.04em',
            }}>
              <span>#</span><span>Name</span><span style={{ textAlign: 'right' }}>Score</span><span>Pop·Acc</span><span style={{ textAlign: 'right' }}>Time</span>
            </div>
            {entries.map((e, i) => (
              <LeaderboardRow key={e.ts} rank={i + 1} entry={e} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function LeaderboardRow({ rank, entry }: { rank: number; entry: LeaderboardEntry }) {
  const isTop3 = rank <= 3;
  const accent = rank === 1 ? '#fbbf24' : rank === 2 ? '#cbd5e1' : rank === 3 ? '#fb923c' : 'rgba(255,255,255,0.7)';
  return (
    <div style={{
      display: 'grid', gridTemplateColumns: '28px 1.2fr 60px 60px 50px',
      alignItems: 'center', gap: 4,
      padding: '6px 8px',
      borderRadius: 8,
      background: isTop3 ? `linear-gradient(90deg, ${accent}22, transparent 80%)` : 'rgba(255,255,255,0.02)',
      fontSize: 12,
      fontFamily: "'JetBrains Mono', monospace",
      fontVariantNumeric: 'tabular-nums',
    }}>
      <span style={{ color: accent, fontWeight: 800 }}>{rank}</span>
      <span style={{
        color: 'white', fontWeight: 600, fontSize: 11,
        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
      }}>
        {entry.name || 'anon'}
      </span>
      <span style={{ color: '#fbbf24', fontWeight: 700, textAlign: 'right' }}>{entry.score}</span>
      <span style={{ color: 'rgba(255,255,255,0.7)', fontSize: 10 }}>
        🎈{entry.killed} · {entry.accuracyPct}%
      </span>
      <span style={{ color: 'rgba(255,255,255,0.55)', textAlign: 'right', fontSize: 10 }}>
        {entry.survivedSec}s
      </span>
    </div>
  );
}

function secondaryBtn(): React.CSSProperties {
  return {
    background: 'rgba(255,255,255,0.06)',
    border: '1px solid rgba(255,255,255,0.16)',
    color: 'white',
    padding: '8px 14px',
    borderRadius: 10,
    fontSize: 13,
    fontWeight: 700,
    cursor: 'pointer',
    minHeight: 44,
  };
}

const PROJECTILE_FLY_MS = 240;

function ProjectileShot({
  fromX, fromY, toX, toY, value, ghostNumber, ghostVariant,
}: {
  fromX: number; fromY: number; toX: number; toY: number;
  value: number | null;
  ghostNumber?: number;
  ghostVariant?: number;
}) {
  const [phase, setPhase] = useState<'flying' | 'popping' | 'done'>('flying');
  useEffect(() => {
    const t1 = setTimeout(() => setPhase('popping'), PROJECTILE_FLY_MS);
    const t2 = setTimeout(() => setPhase('done'), PROJECTILE_FLY_MS + 384 + 80);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, []);
  if (phase === 'done') return null;
  const dx = toX - fromX;
  const dy = toY - fromY;
  return (
    <>
      {phase === 'flying' && ghostNumber !== undefined && ghostVariant !== undefined && (
        <div style={{
          position: 'absolute',
          left: toX - BALLOON_W / 2, top: toY - BALLOON_H / 3,
          width: BALLOON_W, height: BALLOON_H,
          pointerEvents: 'none',
          opacity: 0.85,
        }}>
          <Balloon number={ghostNumber} variant={ghostVariant} />
        </div>
      )}
      {phase === 'flying' && (
        <>
          {/* Trail glow particles */}
          {[0.45, 0.65, 0.85].map((delayPct, idx) => (
            <div
              key={`trail-${idx}`}
              style={{
                position: 'absolute',
                left: fromX - 4, top: fromY - 4,
                width: 10, height: 10,
                borderRadius: '50%',
                background: 'radial-gradient(circle, rgba(251,191,36,0.85), rgba(251,191,36,0))',
                pointerEvents: 'none',
                animation: `projectileTrail ${PROJECTILE_FLY_MS}ms ease-out forwards ${delayPct * 30}ms`,
                ['--dx' as never]: `${dx}px`,
                ['--dy' as never]: `${dy}px`,
                opacity: 0,
              } as React.CSSProperties}
            />
          ))}
          {/* The number itself flies up */}
          <div
            style={{
              position: 'absolute',
              left: fromX - 14, top: fromY - 14,
              width: 28, height: 28,
              borderRadius: '50%',
              background: 'radial-gradient(circle at 35% 35%, #fef3c7, #fbbf24 60%, #b45309 100%)',
              border: '2px solid #d97706',
              boxShadow: '0 0 14px rgba(251,191,36,0.85), inset 0 1px 0 rgba(255,255,255,0.6)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontFamily: "'JetBrains Mono', monospace",
              fontWeight: 800, fontSize: 12, color: '#1f2937',
              animation: `projectileFly ${PROJECTILE_FLY_MS}ms cubic-bezier(0.4, 0, 0.5, 1) forwards`,
              ['--dx' as never]: `${dx}px`,
              ['--dy' as never]: `${dy}px`,
              pointerEvents: 'none',
              zIndex: 7,
            } as React.CSSProperties}
          >
            {value ?? '★'}
          </div>
        </>
      )}
      {phase === 'popping' && <PopBurst x={toX} y={toY} />}
    </>
  );
}

function NicknameInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8,
      background: 'rgba(255,255,255,0.04)',
      border: '1px solid rgba(255,255,255,0.1)',
      borderRadius: 12,
      padding: '6px 12px',
    }}>
      <span style={{ fontSize: 14 }}>👤</span>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Your name (optional)"
        maxLength={20}
        style={{
          flex: 1,
          background: 'transparent',
          border: 'none',
          color: 'white',
          fontSize: 13,
          fontWeight: 600,
          outline: 'none',
          fontFamily: "'Inter', sans-serif",
        }}
      />
      {value && (
        <span style={{
          fontSize: 10,
          color: 'rgba(255,255,255,0.4)',
          fontVariantNumeric: 'tabular-nums',
        }}>
          {value.length}/20
        </span>
      )}
    </div>
  );
}

function AgeBracketPicker({
  value,
  onChange,
  t,
}: {
  value: AgeBracket;
  onChange: (b: AgeBracket) => void;
  t: TFn;
}) {
  const options: AgeBracket[] = ['5-6', '7-9', '10-12'];
  const labelKey = (b: AgeBracket) =>
    b === '5-6' ? ('age.5-6' as const) : b === '7-9' ? ('age.7-9' as const) : ('age.10-12' as const);
  return (
    <div>
      <div style={{
        fontSize: 11, fontWeight: 600, letterSpacing: '0.08em',
        color: 'rgba(255,255,255,0.55)', textTransform: 'uppercase',
        marginBottom: 6, paddingLeft: 2,
      }}>
        {t('age.label')}
      </div>
      <div role="radiogroup" style={{
        display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6,
        background: 'rgba(255,255,255,0.04)',
        border: '1px solid rgba(255,255,255,0.1)',
        borderRadius: 12, padding: 4,
      }}>
        {options.map((b) => {
          const selected = b === value;
          return (
            <button
              key={b}
              role="radio"
              aria-checked={selected}
              onClick={() => onChange(b)}
              className="nd-btn"
              style={{
                appearance: 'none',
                cursor: 'pointer',
                border: 'none',
                borderRadius: 8,
                padding: '10px 6px',
                minHeight: 44,
                fontSize: 12,
                fontWeight: 700,
                lineHeight: 1.25,
                color: selected ? '#1a1a1a' : 'rgba(255,255,255,0.78)',
                background: selected
                  ? 'linear-gradient(180deg, var(--nd-primary), #f5c526)'
                  : 'transparent',
                boxShadow: selected ? '0 2px 8px rgba(255,217,61,0.35)' : 'none',
                transition: 'all 0.15s ease',
                fontFamily: "'Inter', sans-serif",
                textAlign: 'center',
              }}
            >
              {t(labelKey(b))}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function HeroBlock({ taglineLabel }: { taglineLabel: string }) {
  return (
    <div style={{
      position: 'relative',
      textAlign: 'center',
      paddingTop: 12, paddingBottom: 4,
      animation: 'heroEntrance 0.4s ease-out both',
    }}>
      {/* Floating mini balloons left + right */}
      <div style={{
        position: 'absolute', left: '6%', top: 0,
        animation: 'balloonBob 2.6s ease-in-out infinite',
      }}>
        <Balloon number={3} variant={1} />
      </div>
      <div style={{
        position: 'absolute', right: '6%', top: 14,
        animation: 'balloonBob 3.2s ease-in-out infinite 0.4s',
      }}>
        <Balloon number={5} variant={3} />
      </div>

      <h1 style={{ margin: 0, lineHeight: 0 }}>
        <img
          src="/logo-wordmark.png"
          alt="Number Defense"
          style={{
            display: 'block', margin: '0 auto',
            maxWidth: '88%', height: 'auto',
            filter: 'drop-shadow(0 4px 24px rgba(0,0,0,0.4))',
          }}
          draggable={false}
        />
      </h1>
      <div style={{
        marginTop: 6,
        fontSize: 11, color: 'rgba(255,255,255,0.5)',
        letterSpacing: '0.12em', textTransform: 'uppercase',
        fontWeight: 700,
      }}>
        {taglineLabel}
      </div>
    </div>
  );
}

function LtrBanner({ heading, body, note, onClose }: { heading: string; body: string; note: string; onClose: () => void }) {
  const [fading, setFading] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setFading(true), 4500);
    const t2 = setTimeout(onClose, 5200);
    return () => { clearTimeout(t); clearTimeout(t2); };
  }, [onClose]);

  return (
    <div style={{
      width: '100%', maxWidth: 320,
      background: 'linear-gradient(135deg, rgba(167,139,250,0.85), rgba(124,58,237,0.85))',
      border: '1px solid rgba(255,255,255,0.22)',
      borderRadius: 14,
      padding: '10px 14px',
      display: 'flex', alignItems: 'flex-start', gap: 10,
      boxShadow: '0 6px 20px rgba(167,139,250,0.4)',
      opacity: fading ? 0 : 1,
      transition: 'opacity 0.7s ease',
      position: 'relative',
    }}>
      <span style={{ fontSize: 20, flexShrink: 0, marginTop: 1 }}>🧮</span>
      <div style={{ flex: 1, fontSize: 12, color: 'rgba(255,255,255,0.95)', lineHeight: 1.5 }}>
        <div style={{ fontWeight: 800, marginBottom: 2 }}>{heading}</div>
        <div>{body}</div>
        <div style={{ opacity: 0.75, fontSize: 11, marginTop: 2 }}>{note}</div>
      </div>
      <button
        onClick={() => { setFading(true); setTimeout(onClose, 700); }}
        style={{
          background: 'transparent', border: 'none',
          color: 'rgba(255,255,255,0.7)', fontSize: 16,
          cursor: 'pointer', padding: 0, flexShrink: 0,
          lineHeight: 1,
          minWidth: 44, minHeight: 44,
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        }}
        aria-label="닫기"
      >×</button>
    </div>
  );
}

function DonationFooter() {
  return (
    <div style={{
      marginTop: 24,
      paddingTop: 14,
      borderTop: '1px dashed rgba(255,255,255,0.12)',
      fontSize: 11, color: 'rgba(255,255,255,0.4)',
      display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'center',
    }}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
        <span>Free, no ads. Built with care.</span>
        <a
          href="/privacy-policy.html"
          target="_blank" rel="noopener noreferrer"
          style={{ color: 'rgba(255,255,255,0.45)', fontSize: 11, fontWeight: 700 }}
        >
          Privacy
        </a>
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <a
          href="https://buymeacoffee.com/sukim"
          target="_blank" rel="noopener noreferrer"
          style={{
            background: 'linear-gradient(135deg, #fde047, #f59e0b)',
            color: '#1f2937', padding: '4px 10px', borderRadius: 999,
            fontSize: 11, fontWeight: 700, textDecoration: 'none',
            border: '1px solid #d97706',
          }}
        >
          ☕ Buy me a coffee
        </a>
        <a
          href="https://github.com/sponsors/subright85"
          target="_blank" rel="noopener noreferrer"
          style={{
            background: 'rgba(236, 72, 153, 0.18)',
            color: '#fbcfe8',
            padding: '4px 10px', borderRadius: 999,
            fontSize: 11, fontWeight: 700, textDecoration: 'none',
            border: '1px solid rgba(236, 72, 153, 0.5)',
          }}
        >
          ❤ GitHub Sponsor
        </a>
      </div>
    </div>
  );
}

async function downloadScoreCard(args: {
  mode: EquationKind; glyph: string; color: string; score: number;
  killed: number; accuracy: number; survivedSec: number; nickname: string;
}) {
  if (typeof document === 'undefined') return;
  const SIZE = 1080;
  const canvas = document.createElement('canvas');
  canvas.width = SIZE;
  canvas.height = SIZE;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  // Background gradient
  const bg = ctx.createRadialGradient(SIZE * 0.3, SIZE * 0.1, 0, SIZE * 0.5, SIZE * 0.5, SIZE * 0.9);
  bg.addColorStop(0, '#1e1b4b');
  bg.addColorStop(0.4, '#0d0d2b');
  bg.addColorStop(1, '#050510');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, SIZE, SIZE);

  // Stars
  for (let i = 0; i < 60; i++) {
    const x = (i * 9301 + 49297) % SIZE;
    const y = ((i + 13) * 9301 + 49297) % SIZE;
    const r = ((i % 3) + 1);
    ctx.beginPath();
    ctx.fillStyle = `rgba(255, 255, 255, ${0.15 + (i % 4) * 0.1})`;
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  // Title gradient
  const titleGrad = ctx.createLinearGradient(0, 130, SIZE, 220);
  titleGrad.addColorStop(0, '#818cf8');
  titleGrad.addColorStop(0.5, '#f472b6');
  titleGrad.addColorStop(1, '#fbbf24');
  ctx.fillStyle = titleGrad;
  ctx.font = '900 100px Inter, system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('Number Defense', SIZE / 2, 180);

  // Tagline
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  ctx.font = '700 24px Inter, system-ui, sans-serif';
  ctx.fillText('MATH · POP · DEFEND', SIZE / 2, 240);

  // Mode glyph in big colored circle
  const cx = SIZE / 2;
  const cy = 470;
  const radius = 130;
  ctx.beginPath();
  const modeGrad = ctx.createRadialGradient(cx - 30, cy - 30, 20, cx, cy, radius);
  modeGrad.addColorStop(0, args.color);
  modeGrad.addColorStop(1, '#0a0a1f');
  ctx.fillStyle = modeGrad;
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = args.color;
  ctx.stroke();

  // Mode glyph
  ctx.fillStyle = 'white';
  ctx.font = '900 160px JetBrains Mono, monospace';
  ctx.fillText(args.glyph, cx, cy + 6);

  // Score
  ctx.fillStyle = '#fbbf24';
  ctx.font = '900 220px JetBrains Mono, monospace';
  ctx.fillText(String(args.score), SIZE / 2, 760);

  // Score label
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.font = '700 26px Inter, system-ui, sans-serif';
  ctx.fillText('FINAL SCORE', SIZE / 2, 870);

  // Stats line
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.font = '700 32px JetBrains Mono, monospace';
  ctx.fillText(`🎈 ${args.killed}    🎯 ${args.accuracy}%    ⏱ ${args.survivedSec}s`, SIZE / 2, 940);

  // Nickname (if any)
  if (args.nickname) {
    ctx.fillStyle = '#fbcfe8';
    ctx.font = '700 30px Inter, system-ui, sans-serif';
    ctx.fillText(`— ${args.nickname}`, SIZE / 2, 1000);
  }

  // URL
  ctx.fillStyle = 'rgba(255,255,255,0.4)';
  ctx.font = '500 22px Inter, system-ui, sans-serif';
  ctx.fillText('number-defense.vercel.app', SIZE / 2, args.nickname ? 1045 : 1010);

  // Trigger download
  canvas.toBlob((blob) => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `number-defense-${args.score}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }, 'image/png');
}

async function shareScore(args: {
  mode: EquationKind; glyph: string; score: number;
  killed: number; accuracy: number; survivedSec: number;
}) {
  const url = typeof window !== 'undefined' ? window.location.origin || window.location.href : '';
  const title = 'Number Defense';
  const text = `Just survived ${args.survivedSec}s in Number Defense (${args.glyph} mode) — score ${args.score}, ${args.killed} pops, ${args.accuracy}% accuracy. ${url}`;
  if (typeof navigator !== 'undefined' && 'share' in navigator) {
    try {
      await (navigator as Navigator & { share: (data: ShareData) => Promise<void> }).share({ title, text, url });
      return;
    } catch { /* user cancelled */ }
  }
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      alert('Score copied to clipboard!');
      return;
    } catch { /* fallthrough */ }
  }
  const tweetUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`;
  if (typeof window !== 'undefined') window.open(tweetUrl, '_blank', 'noopener');
}
