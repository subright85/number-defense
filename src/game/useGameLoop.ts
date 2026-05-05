import { useState, useCallback, useRef, useEffect } from 'react';
import type { GameState, Tower } from './types';
import { createInitialState, startWave, advanceTurn, placeTower } from './engine';

export function useGameLoop() {
  const [state, setState] = useState<GameState>(() => createInitialState());
  const [autoPlay, setAutoPlayState] = useState(false);
  const autoRef = useRef(false);

  const toggleAutoPlay = useCallback(() => {
    const next = !autoRef.current;
    autoRef.current = next;
    setAutoPlayState(next);
  }, []);

  useEffect(() => {
    const id = setInterval(() => {
      if (!autoRef.current) return;
      setState(s => {
        if (s.phase !== 'wave') {
          autoRef.current = false;
          setAutoPlayState(false);
          return s;
        }
        return advanceTurn(s);
      });
    }, 1500);
    return () => clearInterval(id);
  }, []);

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
    autoRef.current = false;
    setAutoPlayState(false);
    setState(createInitialState());
  }, []);

  return { state, startNextWave, nextTurn, buyTower, restart, autoPlay, toggleAutoPlay };
}
