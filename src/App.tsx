import { useEffect, useState, useRef } from 'react';
import { loadBalance, getStage, getHighScore, getLeaderboard, recordScore } from './game/engine';
import type { LeaderboardEntry } from './game/engine';
import { useGameLoop } from './game/useGameLoop';
import { useT, type Locale } from './i18n';
import { Balloon, BALLOON_W, BALLOON_H, balloonVariantFor } from './components/Balloon';
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
  const { state, flashes, startGame, restart, tap, drop, untap, submit, clear } = useGameLoop();
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
    const survivedSec = state.startedAt > 0 ? Math.floor((Date.now() - state.startedAt) / 1000) : 0;
    const result = recordScore(state.mode, {
      score: finalScore,
      killed: state.killedSoFar,
      accuracyPct: Math.round(accuracy * 100),
      survivedSec,
    });
    setLatestHighScoreSnapshot(result);
  }, [state.phase, state.mode, state.score, state.attempts, state.hits, state.killedSoFar, state.startedAt]);

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
        <div style={{ textAlign: 'center', maxWidth: 380, padding: 24 }}>
          <Title taglineLabel={t('tagline')} />
          <p style={{ color: 'rgba(255,255,255,0.65)', fontSize: 14, lineHeight: 1.6, marginTop: 14 }}>
            {t('menu.intro1')}<br />
            {t('menu.intro2')}<br />
            {t('menu.intro3')}
          </p>

          <div style={{
            display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)',
            gap: 10, marginTop: 22,
          }}>
            {(['add', 'sub', 'mul', 'div'] as EquationKind[]).map(mode => {
              const meta = MODE_META[mode];
              const hs = getHighScore(mode);
              return (
                <button
                  key={mode}
                  onClick={() => { if (meta.available) { unlockAudio(); playStart(); startGame(mode); } }}
                  disabled={!meta.available}
                  style={{
                    background: meta.available ? meta.color : 'rgba(255,255,255,0.04)',
                    border: meta.available
                      ? `1.5px solid ${meta.color}`
                      : '1.5px dashed rgba(255,255,255,0.18)',
                    color: 'white',
                    padding: '14px 12px',
                    borderRadius: 14,
                    fontWeight: 800,
                    cursor: meta.available ? 'pointer' : 'not-allowed',
                    opacity: meta.available ? 1 : 0.5,
                    boxShadow: meta.available ? `0 4px 14px ${meta.color}55` : 'none',
                    textAlign: 'center',
                    transition: 'transform 100ms, box-shadow 100ms',
                  }}
                  className={meta.available ? 'nd-btn' : undefined}
                >
                  <div style={{ fontSize: 28, fontFamily: "'JetBrains Mono', monospace", lineHeight: 1 }}>{meta.glyph}</div>
                  <div style={{ fontSize: 12, marginTop: 4, opacity: 0.92 }}>
                    {t(`kind.${mode}` as 'kind.add' | 'kind.sub' | 'kind.mul' | 'kind.div')}
                  </div>
                  <div style={{
                    fontSize: 10,
                    marginTop: 6,
                    opacity: 0.85,
                    fontFamily: "'JetBrains Mono', monospace",
                  }}>
                    {meta.available ? `BEST · ${hs}` : t('menu.locked' as never) || 'soon'}
                  </div>
                </button>
              );
            })}
          </div>

          <button
            onClick={() => setShowLeaderboard('add')}
            style={{
              marginTop: 16,
              background: 'transparent',
              border: '1px solid rgba(255,255,255,0.18)',
              color: 'rgba(255,255,255,0.85)',
              padding: '8px 16px',
              borderRadius: 999,
              fontSize: 12,
              fontWeight: 700,
              cursor: 'pointer',
              letterSpacing: '0.02em',
            }}
            className="nd-btn"
          >
            🏆 Leaderboard
          </button>

          <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', marginTop: 14 }}>
            Pick a mode. Survive as long as you can.
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

  // ── Phase: gameover ─────────────────────────────────
  if (state.phase === 'gameover') {
    const accuracy = state.attempts > 0 ? Math.round((state.hits / state.attempts) * 100) : 0;
    const finalScore = Math.round(state.score * (state.attempts > 0 ? state.hits / state.attempts : 0));
    const survivedSec = state.startedAt > 0 ? Math.floor((Date.now() - state.startedAt) / 1000) : 0;
    const hsSnap = latestHighScoreSnapshot;
    return (
      <>
      <BackgroundLayer />
      <div style={fullCenterStyle}>
        <LocaleToggle locale={locale} onToggle={toggleLocale} />
        <MuteToggle muted={muted} onToggle={() => { unlockAudio(); const next = !muted; setMuted(next); setMutedState(next); }} />
        <div style={{ textAlign: 'center', maxWidth: 360, padding: 24 }}>
          <h1 style={{ fontSize: 28, margin: 0, color: '#f87171' }}>
            {t('over.gameover')}
          </h1>
          <div style={{ marginTop: 18, fontSize: 14, color: 'rgba(255,255,255,0.78)', lineHeight: 1.7 }}>
            <div>
              {MODE_META[state.mode].glyph} {t(`kind.${state.mode}` as 'kind.add')}
              <span style={{ opacity: 0.5, margin: '0 6px' }}>·</span>
              {survivedSec}s
            </div>
            <div>{t('over.killedPassed')}: <b>{state.killedSoFar}</b> · <b>{state.reachedBaseSoFar}</b></div>
            <div>{t('over.accuracy')}: <b>{accuracy}%</b> ({state.hits}/{state.attempts})</div>
            <div style={{ marginTop: 12, fontSize: 22 }}>
              <b style={{ color: '#fbbf24' }}>{finalScore}</b>
              <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', marginLeft: 8 }}>
                = {state.score} × {accuracy}%
              </span>
            </div>
            {hsSnap && hsSnap.isNew && (
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
            <button onClick={() => startGame(state.mode)} style={primaryBtn(MODE_META[state.mode].color)}>
              ↻ Retry
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
      </div>
      <div style={{
        fontSize: 12, color: 'rgba(255,255,255,0.85)',
        background: 'rgba(255,255,255,0.04)',
        border: '1px solid rgba(255,255,255,0.1)',
        borderRadius: 999, padding: '4px 14px',
      }}>
        {stage.label} · max {stage.numberMax}
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

        {/* Particle burst on hit */}
        {flashes.filter(f => f.kind === 'hit' && f.enemyId && f.enemyProgress !== undefined).map(f => {
          const hashH = (function(){let h=0;const id=f.enemyId!;for(let i=0;i<id.length;i++)h=((h<<5)-h+id.charCodeAt(i))|0;return Math.abs(h);})();
          const xJitter = (hashH % 5) * 22 - 44;
          const cx = LANE_WIDTH / 2 + xJitter;
          const cy = (f.enemyProgress ?? 0) * (LANE_HEIGHT - BALLOON_H - 4) + BALLOON_H / 3;
          const particleCount = 8;
          return (
            <div key={`burst-${f.id}`} style={{ position: 'absolute', left: cx, top: cy, pointerEvents: 'none' }}>
              {Array.from({ length: particleCount }).map((_, i) => {
                const angle = (i / particleCount) * Math.PI * 2;
                const dx = Math.cos(angle) * 26;
                const dy = Math.sin(angle) * 26;
                const colors = ['#fde047', '#fb923c', '#f87171', '#fbcfe8', '#a5f3fc', '#86efac'];
                const color = colors[(hashH + i) % colors.length];
                return (
                  <span
                    key={i}
                    style={{
                      position: 'absolute', left: 0, top: 0,
                      width: 6, height: 6,
                      borderRadius: '50%',
                      background: color,
                      boxShadow: `0 0 6px ${color}`,
                      ['--dx' as never]: `${dx}px`,
                      ['--dy' as never]: `${dy}px`,
                      animation: 'particleBurst 600ms ease-out forwards',
                    } as React.CSSProperties}
                  />
                );
              })}
            </div>
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
