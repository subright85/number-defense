import type { Cell, CellType } from './types';

export const GRID_SIZE = 10;

// Path from spawn (0,0 top-left area) to base (9,9 bottom-right area)
// Defined as [x, y] coordinate sequence
export const PATH_COORDS: [number, number][] = [
  [0,2],[1,2],[2,2],[2,3],[2,4],[2,5],
  [3,5],[4,5],[5,5],[5,4],[5,3],[5,2],
  [6,2],[7,2],[7,3],[7,4],[7,5],[7,6],
  [7,7],[6,7],[5,7],[4,7],[4,8],[4,9],
  [5,9],[6,9],[7,9],[8,9],[9,9],
];

export const SPAWN_COORD: [number, number] = [0, 2];
export const BASE_COORD: [number, number] = [9, 9];

function buildGrid(): Cell[][] {
  const pathSet = new Set(PATH_COORDS.map(([x, y]) => `${x},${y}`));
  const grid: Cell[][] = [];
  for (let y = 0; y < GRID_SIZE; y++) {
    grid[y] = [];
    for (let x = 0; x < GRID_SIZE; x++) {
      let type: CellType = 'empty';
      if (`${x},${y}` === `${SPAWN_COORD[0]},${SPAWN_COORD[1]}`) type = 'spawn';
      else if (`${x},${y}` === `${BASE_COORD[0]},${BASE_COORD[1]}`) type = 'base';
      else if (pathSet.has(`${x},${y}`)) type = 'path';
      grid[y][x] = { x, y, type };
    }
  }
  return grid;
}

export const INITIAL_GRID: Cell[][] = buildGrid();
