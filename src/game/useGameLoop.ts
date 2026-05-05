import { useState, useCallback, useEffect, useRef } from 'react';
import type { EquationKind, GameState } from './types';
import {
  createInitialState, startEndlessRun, startDailyRun, pauseGame, resumeGame,
  spawnEnemy, tickEnemies, refillPool,
  tapPoolEntry, dropIntoSlot, untapEquationSlot, clearEquation, submitEquation,
  getStage, mulberry32, dailySeed,
} from './engine';

const TICK_MS = 100;

export interface FlashEvent {
  id: string;
  kind: 'hit' | 'miss';
  enemyId?: string;
  enemyProgress?: number; // 0..1, fall progress at the moment of kill
  text: string;
  ts: number;
}

let flashCounter = 0;

export function useGameLoop() {
  const [state, setState] = useState<GameState>(() => createInitialState());
  const [flashes, setFlashes] = useState<FlashEvent[]>([]);
  const rngRef = useRef<() => number>(Math.random);

  const startGame = useCallback((mode: EquationKind = 'add') => {
    const now = Date.now();
    rngRef.current = Math.random;
    setState(s => {
      const fresh = startEndlessRun(s, mode, now, rngRef.current);
      return spawnEnemy(fresh, now, rngRef.current);
    });
    setFlashes([]);
  }, []);

  const startDaily = useCallback(() => {
    const now = Date.now();
    rngRef.current = mulberry32(dailySeed());
    setState(s => {
      const fresh = startDailyRun(s, now, rngRef.current);
      return spawnEnemy(fresh, now, rngRef.current);
    });
    setFlashes([]);
  }, []);

  const restart = useCallback(() => {
    setState(createInitialState());
    setFlashes([]);
  }, []);

  const togglePause = useCallback(() => {
    setState(s => {
      const now = Date.now();
      if (s.phase === 'playing') return pauseGame(s, now);
      if (s.phase === 'paused') return resumeGame(s, now);
      return s;
    });
  }, []);

  // Game tick: spawns, falling progress, pool refill.
  useEffect(() => {
    if (state.phase !== 'playing') return;
    const id = setInterval(() => {
      const now = Date.now();
      setState(prev => {
        if (prev.phase !== 'playing') return prev;
        const stage = getStage(prev.stageIndex);
        if (!stage) return prev;

        let next = prev;
        next = refillPool(next, now, rngRef.current);
        next = tickEnemies(next, now);
        if (
          next.phase === 'playing' &&
          now - next.lastSpawnAt >= stage.spawnIntervalMs
        ) {
          next = spawnEnemy(next, now, rngRef.current);
        }
        return next;
      });
    }, TICK_MS);
    return () => clearInterval(id);
  }, [state.phase]);

  const tap = useCallback((entryId: string) => {
    setState(s => tapPoolEntry(s, entryId));
  }, []);

  const drop = useCallback((entryId: string, slotIndex: number) => {
    setState(s => dropIntoSlot(s, entryId, slotIndex));
  }, []);

  const untap = useCallback((slotIndex: number) => {
    setState(s => untapEquationSlot(s, slotIndex));
  }, []);

  const clear = useCallback(() => {
    setState(s => clearEquation(s));
  }, []);

  const submit = useCallback(() => {
    setState(s => {
      const now = Date.now();
      const result = submitEquation(s, now);
      if (result.result !== null) {
        let enemyProgress: number | undefined;
        if (result.killedEnemyId) {
          const killed = s.enemies.find(e => e.id === result.killedEnemyId);
          if (killed) enemyProgress = Math.min(1, (now - killed.spawnedAt) / killed.fallDurationMs);
        }
        const flash: FlashEvent = {
          id: `f${++flashCounter}`,
          kind: result.hit ? 'hit' : 'miss',
          enemyId: result.killedEnemyId ?? undefined,
          enemyProgress,
          text: result.hit ? `= ${result.result} ✓` : `= ${result.result} ✗`,
          ts: now,
        };
        setFlashes(prev => [...prev, flash]);
      }
      return result.state;
    });
  }, []);

  // Expire flashes after 900ms
  useEffect(() => {
    if (!flashes.length) return;
    const id = setTimeout(() => {
      setFlashes(prev => prev.filter(f => Date.now() - f.ts < 900));
    }, 200);
    return () => clearTimeout(id);
  }, [flashes]);

  return { state, flashes, startGame, startDaily, restart, togglePause, tap, drop, untap, clear, submit };
}
