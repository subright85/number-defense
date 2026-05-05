import { useState, useCallback, useRef, useEffect } from 'react';
import type { AgeBucket, GameState, Tower } from './types';
import { createInitialState, startWave, advanceTurn, placeTower } from './engine';

export interface DamageEvent {
  id: string;
  enemyId: string;
  amount: number;
  ts: number;
}

const TICK_MS = 500;

export function useGameLoop() {
  const [state, setState] = useState<GameState>(() => createInitialState());
  const [paused, setPaused] = useState(false);
  const [damageEvents, setDamageEvents] = useState<DamageEvent[]>([]);
  const eventIdRef = useRef(0);

  const togglePause = useCallback(() => setPaused(p => !p), []);

  const startNextWave = useCallback(() => {
    setState(s => s.phase === 'prep' ? startWave(s) : s);
    setPaused(false);
  }, []);

  const nextTurn = useCallback(() => {
    setState(s => {
      if (s.phase !== 'wave') return s;
      const next = advanceTurn(s);
      const events: DamageEvent[] = [];
      next.enemies.forEach(e2 => {
        const e1 = s.enemies.find(e => e.id === e2.id);
        if (e1 && e1.hp > e2.hp) {
          events.push({
            id: `d${++eventIdRef.current}`,
            enemyId: e2.id,
            amount: e1.hp - e2.hp,
            ts: Date.now(),
          });
        }
      });
      if (events.length) setDamageEvents(prev => [...prev, ...events]);
      return next;
    });
  }, []);

  // Auto-tick whenever a wave is active and not paused
  useEffect(() => {
    if (state.phase !== 'wave' || paused) return;
    const id = setInterval(nextTurn, TICK_MS);
    return () => clearInterval(id);
  }, [state.phase, paused, nextTurn]);

  // Expire damage events older than 700ms
  useEffect(() => {
    if (!damageEvents.length) return;
    const id = setTimeout(() => {
      setDamageEvents(prev => prev.filter(e => Date.now() - e.ts < 700));
    }, 100);
    return () => clearTimeout(id);
  }, [damageEvents]);

  const buyTower = useCallback((x: number, y: number, tier: Tower['tier']) => {
    setState(s => {
      const next = placeTower(s, x, y, tier);
      return next ?? s;
    });
  }, []);

  const setAgeBucket = useCallback((bucket: AgeBucket) => {
    setState(s => ({ ...s, ageBucket: bucket }));
  }, []);

  const restart = useCallback(() => {
    setState(createInitialState());
    setDamageEvents([]);
    setPaused(false);
  }, []);

  return { state, paused, damageEvents, startNextWave, nextTurn, buyTower, restart, togglePause, setAgeBucket };
}
