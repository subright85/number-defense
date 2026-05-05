import { useEffect, useState, useRef } from 'react';
import { loadBalance, getStage, getHighScore, getLeaderboard, recordScore, getDailyBest, recordDaily, dailyKindForDate, dateKey } from './game/engine';
import type { LeaderboardEntry } from './game/engine';
import { useGameLoop } from './game/useGameLoop';
import { useT, type Locale } from './i18n';
import { Balloon, BALLOON_W, BALLOON_H, balloonVariantFor, PopBurst } from './components/Balloon';
import { PoolTile } from './components/PoolTile';
import { BackgroundLayer } from './components/BackgroundLayer';
import { playPop, playMiss, playLifeLost, playStart, unlockAudio, isMuted, setMuted } from './sfx';
import type { EquationKind } from './game/types';

const LANE_HEIGHT = 460;
const LANE_WIDTH  = 320;

const MODE_META: Record<EquationKind, { glyph: string; color: string; available: boolean }> = {
  add: { glyph: '+', color: '#10b981', available: true },
  sub: { glyph: '−', color: '#f59e0b', available: true },
  mul: { glyph: '×', color: '#ec4899', available: true },
  div: { glyph: '÷', color: '#6366f1', available: true },
};

export default function App() {
  const [loaded, setLoaded] = useState(false);
  const [now, setNow] = useState(Date.now());
  const { state, flashes, startGame, startDaily, restart, togglePause, tap, drop, untap, submit, clear } = useGameLoop();
  const recentlyKilledRef = useRef<Map<string, number>>(new Map());
  const { locale, toggleLocale, t } = useT();
  const recordedHighScoreRef = useRef(false);
  const [latestHighScoreSnapshot, setLatestHighScoreSnapshot] = useState<{
    isNew: boolean; previous: number; rank: number | null;
  } | null>(null);
  const [showLeaderboard, setShowLeaderboard] = useState<EquationKind | null>(null);
  const [muted, setMutedState] = useState<boolean>(() => isMuted());
  const lastFlashIdRef = useRef<string | null>(null);
  const lastReachedRef = useRef<number>(0);
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

  useEffect(() => {
    loadBalance().then(() => { restart(); setLoaded(true); });
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

  // Record final score on gameover
  useEffect(() => {
    if (state.phase !== 'gameover' || recordedHighScoreRef.current) return;
    recordedHighScoreRef.current = true;
    const accuracy = state.attempts > 0 ? state.hits / state.attempts : 0;
    const finalScore = Math.round(state.score * accuracy);
    const livePauseElapsed = state.pausedAt > 0 ? Date.now() - state.pausedAt : 0;
    const survivedSec = state.startedAt > 0
      ? Math.max(0, Math.floor((Date.now() - state.startedAt - state.pausedTotal - livePauseElapsed) / 1000))
      : 0;
    if (state.isDaily) {
      recordDaily({
        score: finalScore,
        killed: state.killedSoFar,
        accuracyPct: Math.round(accuracy * 100),
        survivedSec,
        bestCombo: state.bestCombo,
      }, state.dailyDateKey);
      setLatestHighScoreSnapshot({ isNew: false, previous: 0, rank: null });
    } else {
      const result = recordScore(state.mode, {
        score: finalScore,
        killed: state.killedSoFar,
        accuracyPct: Math.round(accuracy * 100),
        survivedSec,
      });
      setLatestHighScoreSnapshot(result);
    }
  }, [state.phase, state.mode, state.score, state.attempts, state.hits, state.killedSoFar, state.startedAt, state.isDaily, state.dailyDateKey, state.bestCombo, state.pausedAt, state.pausedTotal]);

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
      <div style={fullCenterStyle}>
        <LocaleToggle locale={locale} onToggle={toggleLocale} />
        <MuteToggle muted={muted} onToggle={() => { unlockAudio(); const next = !muted; setMuted(next); setMutedState(next); }} />
        <div style={{
          maxWidth: 420, width: '100%', padding: '32px 20px 24px',
          display: 'flex', flexDirection: 'column', gap: 16,
        }}>
          <HeroBlock taglineLabel={t('tagline')} />

          <div style={{
            display: 'flex', alignItems: 'center', gap: 8, marginTop: 6,
            color: 'rgba(255,255,255,0.55)', fontSize: 12, lineHeight: 1.5,
            background: 'rgba(255,255,255,0.025)',
            border: '1px solid rgba(255,255,255,0.06)',
            borderRadius: 12, padding: '10px 12px',
          }}>
            <span style={{ fontSize: 18 }}>🎈</span>
            <span>
              {t('menu.intro1')}{' '}{t('menu.intro2')}
            </span>
          </div>

          <DailyChallengeCard onStart={() => { unlockAudio(); playStart(); startDaily(); }} />

          <div>
            <div style={{
              fontSize: 10, color: 'rgba(255,255,255,0.45)',
              letterSpacing: '0.08em', textTransform: 'uppercase',
              fontWeight: 700, marginBottom: 8, paddingLeft: 4,
            }}>
              Endless Modes
            </div>
            <div style={{
              display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10,
            }}>
              {(['add', 'sub', 'mul', 'div'] as EquationKind[]).map(mode => {
                const meta = MODE_META[mode];
                const hs = getHighScore(mode);
                return (
                  <ModeCard
                    key={mode}
                    glyph={meta.glyph}
                    color={meta.color}
                    label={t(`kind.${mode}` as 'kind.add' | 'kind.sub' | 'kind.mul' | 'kind.div')}
                    best={hs}
                    available={meta.available}
                    onClick={() => { if (meta.available) { unlockAudio(); playStart(); startGame(mode); } }}
                    onLeaderboard={() => setShowLeaderboard(mode)}
                  />
                );
              })}
            </div>
          </div>

          <DonationFooter />
        </div>
        {showLeaderboard && (
          <LeaderboardModal
            mode={showLeaderboard}
            onClose={() => setShowLeaderboard(null)}
            kindLabel={t(`kind.${showLeaderboard}` as 'kind.add')}
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
          <h1 style={{ fontSize: 28, margin: 0, color: '#f87171' }}>
            {state.isDaily ? '🎯 Daily — Game Over' : t('over.gameover')}
          </h1>
          <div style={{ marginTop: 18, fontSize: 14, color: 'rgba(255,255,255,0.78)', lineHeight: 1.7 }}>
            <div>
              {MODE_META[state.mode].glyph} {t(`kind.${state.mode}` as 'kind.add')}
              {state.isDaily && <span style={{ opacity: 0.5, margin: '0 6px' }}>·</span>}
              {state.isDaily && <span style={{ color: '#fbbf24', fontWeight: 700 }}>{state.dailyDateKey}</span>}
              <span style={{ opacity: 0.5, margin: '0 6px' }}>·</span>
              {survivedSec}s
            </div>
            <div>{t('over.killedPassed')}: <b>{state.killedSoFar}</b> · <b>{state.reachedBaseSoFar}</b></div>
            <div>{t('over.accuracy')}: <b>{accuracy}%</b> ({state.hits}/{state.attempts})</div>
            <div>🔥 Best combo: <b>×{state.bestCombo}</b></div>
            <div style={{ marginTop: 12, fontSize: 22 }}>
              <b style={{ color: '#fbbf24' }}>{finalScore}</b>
              <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', marginLeft: 8 }}>
                = {state.score} × {accuracy}%
              </span>
            </div>
            {hsSnap && hsSnap.isNew && !state.isDaily && (
              <div style={{
                marginTop: 8, fontSize: 12, fontWeight: 800,
                color: '#34d399',
                background: 'rgba(16,185,129,0.15)',
                border: '1px solid rgba(16,185,129,0.4)',
                borderRadius: 8, padding: '6px 12px', display: 'inline-block',
              }}>
                ⭐ NEW BEST · prev {hsSnap.previous}
              </div>
            )}
            {state.isDaily && (() => {
              const todayBest = getDailyBest(state.dailyDateKey);
              if (!todayBest) return null;
              const isToday = todayBest.score === finalScore && todayBest.bestCombo === state.bestCombo;
              return (
                <div style={{
                  marginTop: 8, fontSize: 12, fontWeight: 800,
                  color: isToday ? '#34d399' : '#fbbf24',
                  background: isToday ? 'rgba(16,185,129,0.15)' : 'rgba(251,191,36,0.12)',
                  border: `1px solid ${isToday ? 'rgba(16,185,129,0.4)' : 'rgba(251,191,36,0.4)'}`,
                  borderRadius: 8, padding: '6px 12px', display: 'inline-block',
                }}>
                  {isToday ? '⭐ NEW DAILY BEST' : `today's best · ${todayBest.score}`}
                </div>
              );
            })()}
            {hsSnap && !hsSnap.isNew && hsSnap.rank && (
              <div style={{ marginTop: 6, fontSize: 11, color: '#fbbf24', fontWeight: 700 }}>
                Top 10 · ranked #{hsSnap.rank} (best {hsSnap.previous})
              </div>
            )}
            {hsSnap && !hsSnap.isNew && !hsSnap.rank && (
              <div style={{ marginTop: 6, fontSize: 11, color: 'rgba(255,255,255,0.55)' }}>
                BEST · {hsSnap.previous}
              </div>
            )}
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginTop: 22, flexWrap: 'wrap' }}>
            <button
              onClick={() => state.isDaily ? startDaily() : startGame(state.mode)}
              style={primaryBtn(MODE_META[state.mode].color)}
            >
              ↻ Retry
            </button>
            <button
              onClick={() => shareScore({
                mode: state.mode,
                glyph: MODE_META[state.mode].glyph,
                score: finalScore,
                killed: state.killedSoFar,
                accuracy,
                survivedSec,
              })}
              style={secondaryBtn()}
            >
              ✉ Share
            </button>
            <button onClick={() => setShowLeaderboard(state.mode)} style={secondaryBtn()}>
              🏆 Leaderboard
            </button>
            <button onClick={restart} style={secondaryBtn()}>
              ← Menu
            </button>
          </div>
        </div>
        {showLeaderboard && (
          <LeaderboardModal
            mode={showLeaderboard}
            onClose={() => setShowLeaderboard(null)}
            kindLabel={t(`kind.${showLeaderboard}` as 'kind.add')}
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
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      minHeight: '100vh', padding: '12px 12px 18px', gap: 10,
      position: 'relative', zIndex: 1,
    }}>
      <LocaleToggle locale={locale} onToggle={toggleLocale} />
      <Title small taglineLabel={t('tagline')} />
      <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'center' }}>
        <Pill icon="❤️" label={state.lives} accent="#ef4444" />
        <Pill icon="🎯" label={`${accuracy}%`} accent="#34d399" />
        <Pill icon="⭐" label={state.score} accent="#a78bfa" />
        <Pill icon="🎈" label={state.killedSoFar} accent="#38bdf8" />
        <Pill icon="⏱" label={`${survivedSec}s`} accent="#fbbf24" />
        {state.combo >= 2 && (
          <Pill icon="🔥" label={`x${state.combo}`} accent="#f97316" />
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
          onClick={togglePause}
          style={{
            background: 'rgba(255,255,255,0.06)',
            border: '1px solid rgba(255,255,255,0.18)',
            color: 'white',
            padding: '4px 10px',
            borderRadius: 999,
            fontSize: 12,
            fontWeight: 700,
            cursor: 'pointer',
          }}
        >
          {state.phase === 'paused' ? '▶ Resume' : '⏸ Pause'}
        </button>
      </div>

      {/* Falling lane */}
      <div style={{
        position: 'relative',
        width: LANE_WIDTH,
        height: LANE_HEIGHT,
        background:
          'linear-gradient(180deg, rgba(99,102,241,0.10) 0%, rgba(99,102,241,0.02) 30%, rgba(0,0,0,0) 100%)',
        border: '1px solid rgba(255,255,255,0.08)',
        borderBottom: '3px solid #ef4444',
        borderRadius: 16,
        overflow: 'hidden',
        boxShadow: '0 4px 24px rgba(0,0,0,0.5), inset 0 0 30px rgba(255,255,255,0.02)',
      }}>
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
          return (
            <div
              key={e.id}
              style={{
                position: 'absolute', left, top,
                width: BALLOON_W, height: BALLOON_H,
                transition: 'top 80ms linear',
              }}
            >
              <Balloon number={e.target} variant={balloonVariantFor(e.id)} danger={danger} />
            </div>
          );
        })}

        {/* Sprite-based pop animation (Usopp 6-frame burst) */}
        {flashes.filter(f => f.kind === 'hit' && f.enemyId && f.enemyProgress !== undefined).map(f => {
          const hashH = (function(){let h=0;const id=f.enemyId!;for(let i=0;i<id.length;i++)h=((h<<5)-h+id.charCodeAt(i))|0;return Math.abs(h);})();
          const xJitter = (hashH % 5) * 22 - 44;
          const cx = LANE_WIDTH / 2 + xJitter;
          const cy = (f.enemyProgress ?? 0) * (LANE_HEIGHT - BALLOON_H - 4) + BALLOON_H / 3;
          return <PopBurst key={`burst-${f.id}`} x={cx} y={cy} />;
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
                  ? 'linear-gradient(135deg, #818cf8, #4f46e5)'
                  : isHoverDrop
                    ? 'rgba(99,102,241,0.18)'
                    : 'rgba(255,255,255,0.04)',
                border: slot.value !== null
                  ? '1.5px solid #818cf8'
                  : isHoverDrop
                    ? '2px dashed #818cf8'
                    : '1.5px dashed rgba(255,255,255,0.25)',
                fontSize: 18, fontWeight: 800,
                color: 'white',
                cursor: slot.value !== null ? 'pointer' : 'default',
                fontFamily: "'JetBrains Mono', monospace",
                boxShadow: slot.value !== null ? '0 2px 6px rgba(99,102,241,0.5)' : 'none',
                transition: 'background 100ms, border 100ms',
              }}
            >
              {slot.value ?? '?'}
            </button>
          );
        })}
        <span style={{ fontSize: 22, fontWeight: 800, color: 'rgba(255,255,255,0.7)' }}>=</span>
        <span style={{ fontSize: 22, fontWeight: 800, color: '#fbbf24', fontFamily: "'JetBrains Mono', monospace" }}>?</span>
      </div>

      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={clear} style={secondaryBtn()}>{t('eq.clear')}</button>
      </div>

      {/* Pool */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${state.pool.length}, 60px)`,
        gap: 8,
        padding: 10,
        background: 'rgba(255,255,255,0.03)',
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: 14,
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
          background: 'rgba(99, 102, 241, 0.95)',
          color: 'white',
          padding: '10px 14px',
          borderRadius: 14,
          fontSize: 12, fontWeight: 700,
          lineHeight: 1.5,
          boxShadow: '0 8px 24px rgba(99,102,241,0.55)',
          border: '1px solid rgba(255,255,255,0.18)',
        }}
      >
        👋 Tap or drag a number tile up into the equation. Match the result to a falling balloon.
        <button
          onClick={() => {
            setShowOnboarding(false);
            if (typeof window !== 'undefined') window.localStorage.setItem('nd_onboarded', '1');
          }}
          style={{
            marginTop: 8, fontSize: 11,
            background: 'rgba(255,255,255,0.18)',
            border: 'none', color: 'white',
            padding: '4px 10px', borderRadius: 999,
            fontWeight: 700, cursor: 'pointer',
          }}
        >
          got it
        </button>
      </div>
    )}
    {state.phase === 'paused' && (
      <div
        onClick={togglePause}
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
          background: 'linear-gradient(90deg, #818cf8, #f472b6, #fbbf24)',
          WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
          backgroundClip: 'text',
        }}>
          ⏸ Paused
        </div>
        <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.65)' }}>
          tap anywhere to resume
        </div>
        <button
          onClick={(e) => { e.stopPropagation(); restart(); }}
          style={{ ...secondaryBtn(), marginTop: 12 }}
        >
          ← Quit to menu
        </button>
      </div>
    )}
    {drag && drag.moved && (
      <div
        style={{
          position: 'fixed',
          left: drag.x - 30, top: drag.y - 30,
          width: 60, height: 60,
          borderRadius: 14,
          background: 'linear-gradient(150deg, #fef3c7 0%, #fbbf24 100%)',
          border: '2px solid #d97706',
          boxShadow: '0 8px 22px rgba(217,119,6,0.7)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 22, fontWeight: 900, color: '#1f2937',
          fontFamily: "'JetBrains Mono', monospace",
          zIndex: 300,
          pointerEvents: 'none',
          transform: 'scale(1.08)',
        }}
      >
        {drag.number}
      </div>
    )}
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
        background: 'linear-gradient(90deg, #818cf8, #f472b6, #fbbf24)',
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
      }}
      title={muted ? 'Unmute' : 'Mute'}
    >
      {muted ? '🔇' : '🔊'}
    </button>
  );
}

function Pill({ icon, label, accent }: { icon: string; label: string | number; accent: string }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 6,
      padding: '4px 10px', borderRadius: 999,
      background: 'rgba(255,255,255,0.04)',
      border: `1px solid ${accent}33`,
      fontSize: 13, fontWeight: 700,
      color: '#f5f5fa',
      fontVariantNumeric: 'tabular-nums',
      fontFamily: "'JetBrains Mono', monospace",
    }}>
      <span aria-hidden style={{ filter: `drop-shadow(0 0 4px ${accent}88)` }}>{icon}</span>
      <span>{label}</span>
    </span>
  );
}

function primaryBtn(color: string): React.CSSProperties {
  return {
    background: color,
    border: 'none',
    color: 'white',
    padding: '8px 18px',
    borderRadius: 10,
    fontSize: 14,
    fontWeight: 800,
    cursor: 'pointer',
    boxShadow: `0 3px 10px ${color}66`,
  };
}

function LeaderboardModal({
  mode, onClose, kindLabel,
}: { mode: EquationKind; onClose: () => void; kindLabel: string }) {
  const entries = getLeaderboard(mode);
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
          <div style={{ fontSize: 18, fontWeight: 800 }}>
            🏆 Top 10 · {MODE_META[mode].glyph} {kindLabel}
          </div>
          <button onClick={onClose} style={{
            background: 'transparent', border: 'none',
            color: 'rgba(255,255,255,0.6)', fontSize: 18, cursor: 'pointer',
          }}>×</button>
        </div>
        {entries.length === 0 ? (
          <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 13, padding: '24px 0', textAlign: 'center' }}>
            No scores yet. Be the first.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <div style={{
              display: 'grid', gridTemplateColumns: '32px 1fr 1fr 60px',
              fontSize: 10, color: 'rgba(255,255,255,0.4)',
              padding: '4px 8px', textTransform: 'uppercase', letterSpacing: '0.04em',
            }}>
              <span>#</span><span>Score</span><span>Pop · Acc</span><span style={{ textAlign: 'right' }}>Time</span>
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
      display: 'grid', gridTemplateColumns: '32px 1fr 1fr 60px',
      alignItems: 'center',
      padding: '6px 8px',
      borderRadius: 8,
      background: isTop3 ? `linear-gradient(90deg, ${accent}22, transparent 80%)` : 'rgba(255,255,255,0.02)',
      fontSize: 12,
      fontFamily: "'JetBrains Mono', monospace",
      fontVariantNumeric: 'tabular-nums',
    }}>
      <span style={{ color: accent, fontWeight: 800 }}>{rank}</span>
      <span style={{ color: '#fbbf24', fontWeight: 700 }}>{entry.score}</span>
      <span style={{ color: 'rgba(255,255,255,0.7)' }}>
        🎈{entry.killed} · {entry.accuracyPct}%
      </span>
      <span style={{ color: 'rgba(255,255,255,0.55)', textAlign: 'right' }}>
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
  };
}

function DailyChallengeCard({ onStart }: { onStart: () => void }) {
  const today = dateKey();
  const mode = dailyKindForDate();
  const meta = MODE_META[mode];
  const best = getDailyBest(today);
  return (
    <button
      onClick={onStart}
      style={{
        marginTop: 18,
        width: '100%',
        background: `linear-gradient(120deg, ${meta.color}88, ${meta.color}44)`,
        border: `1.5px solid ${meta.color}`,
        borderRadius: 14,
        padding: '14px 16px',
        color: 'white',
        cursor: 'pointer',
        textAlign: 'left',
        boxShadow: `0 6px 18px ${meta.color}55`,
      }}
      className="nd-btn"
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.7)', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
            🎯 Today's Challenge
          </div>
          <div style={{ fontSize: 16, fontWeight: 800, marginTop: 2 }}>
            {meta.glyph} mode · {today}
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          {best ? (
            <>
              <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.6)' }}>YOUR BEST</div>
              <div style={{ fontSize: 18, fontWeight: 900, fontFamily: "'JetBrains Mono', monospace", color: '#fbbf24' }}>
                {best.score}
              </div>
              <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.55)' }}>
                {best.survivedSec}s · {best.accuracyPct}%
              </div>
            </>
          ) : (
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.7)', fontWeight: 700 }}>
              ▶ Play
            </div>
          )}
        </div>
      </div>
    </button>
  );
}

function HeroBlock({ taglineLabel }: { taglineLabel: string }) {
  return (
    <div style={{
      position: 'relative',
      textAlign: 'center',
      paddingTop: 12, paddingBottom: 4,
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

      <h1 style={{
        margin: 0,
        fontSize: 38,
        fontWeight: 900,
        letterSpacing: '-0.025em',
        background: 'linear-gradient(90deg, #818cf8, #f472b6, #fbbf24)',
        WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
        backgroundClip: 'text',
        textShadow: '0 4px 24px rgba(0,0,0,0.4)',
        lineHeight: 1.05,
      }}>
        Number<br />Defense
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

function ModeCard({
  glyph, color, label, best, available, onClick, onLeaderboard,
}: {
  glyph: string; color: string; label: string;
  best: number; available: boolean;
  onClick: () => void; onLeaderboard: () => void;
}) {
  const hasScore = best > 0;
  return (
    <div style={{ position: 'relative' }}>
      <button
        onClick={onClick}
        disabled={!available}
        style={{
          width: '100%',
          background: available
            ? `linear-gradient(140deg, ${color}cc 0%, ${color}77 100%)`
            : 'rgba(255,255,255,0.04)',
          border: available
            ? `1.5px solid ${color}`
            : '1.5px dashed rgba(255,255,255,0.18)',
          color: 'white',
          padding: '16px 12px 14px',
          borderRadius: 14,
          fontWeight: 800,
          cursor: available ? 'pointer' : 'not-allowed',
          opacity: available ? 1 : 0.45,
          boxShadow: available ? `0 6px 18px ${color}55, inset 0 1px 0 rgba(255,255,255,0.18)` : 'none',
          textAlign: 'center',
          transition: 'transform 100ms, box-shadow 100ms, filter 100ms',
        }}
        className={available ? 'nd-btn' : undefined}
      >
        <div style={{
          fontSize: 36,
          fontFamily: "'JetBrains Mono', monospace",
          lineHeight: 1,
          textShadow: '0 2px 6px rgba(0,0,0,0.3)',
        }}>{glyph}</div>
        <div style={{ fontSize: 12, marginTop: 6, opacity: 0.95, letterSpacing: '0.02em' }}>
          {label}
        </div>
        <div style={{
          fontSize: 10,
          marginTop: 8,
          opacity: hasScore ? 0.95 : 0.55,
          fontFamily: "'JetBrains Mono', monospace",
          letterSpacing: '0.06em',
        }}>
          {available
            ? (hasScore ? `★ ${best}` : 'PLAY')
            : 'SOON'}
        </div>
      </button>
      {available && hasScore && (
        <button
          onClick={(e) => { e.stopPropagation(); onLeaderboard(); }}
          title="Top 10"
          style={{
            position: 'absolute', top: 6, right: 6,
            width: 22, height: 22, borderRadius: 11,
            background: 'rgba(0,0,0,0.35)',
            border: '1px solid rgba(255,255,255,0.25)',
            color: 'white', cursor: 'pointer',
            fontSize: 10, padding: 0,
          }}
          className="nd-btn"
        >
          🏆
        </button>
      )}
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
      <div>Free, no ads. Built with care.</div>
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
