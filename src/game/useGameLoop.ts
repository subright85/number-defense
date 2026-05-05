import { useState, useCallback, useEffect } from 'react';
import type { EquationKind, GameState } from './types';
import {
  createInitialState, startEndlessRun,
  spawnEnemy, tickEnemies, refillPool,
  tapPoolEntry, dropIntoSlot, untapEquationSlot, clearEquation, submitEquation,
  getStage,
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

  const startGame = useCallback((mode: EquationKind = 'add') => {
    const now = Date.now();
    setState(s => {
      const fresh = startEndlessRun(s, mode, now);
      return spawnEnemy(fresh, now);
    });
    setFlashes([]);
  }, []);

  const restart = useCallback(() => {
    setState(createInitialState());
    setFlashes([]);
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
        next = refillPool(next, now);
        next = tickEnemies(next, now);
        if (
          next.phase === 'playing' &&
          now - next.lastSpawnAt >= stage.spawnIntervalMs
        ) {
          next = spawnEnemy(next, now);
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

  return { state, flashes, startGame, restart, tap, drop, untap, clear, submit };
}
