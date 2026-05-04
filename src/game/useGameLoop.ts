import { useState, useCallback } from 'react';
import type { GameState, Tower } from './types';
import { createInitialState, startWave, advanceTurn, placeTower } from './engine';

export function useGameLoop() {
  const [state, setState] = useState<GameState>(() => createInitialState());

  const startNextWave = useCallback(() => {
    setState(s => s.phase === 'prep' ? startWave(s) : s);
  }, []);

  const nextTurn = useCallback(() => {
    setState(s => s.phase === 'wave' ? advanceTurn(s) : s);
  }, []);

  const buyTower = useCallback((x: number, y: number, tier: Tower['tier']) => {
    setState(s => {
      const next = placeTower(s, x, y, tier);
      return next ?? s;
    });
  }, []);

  const restart = useCallback(() => {
    setState(createInitialState());
  }, []);

  return { state, startNextWave, nextTurn, buyTower, restart };
}
