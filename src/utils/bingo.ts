export function getSafePatternGrid(rawGrid: any): boolean[][] {
  let gridArray: any = rawGrid;
  if (typeof gridArray === 'string') {
    try {
      gridArray = JSON.parse(gridArray);
    } catch {
      gridArray = [];
    }
  }

  if (!Array.isArray(gridArray)) {
    return Array(5).fill(null).map(() => Array(5).fill(false));
  }

  // Case 1: 1D array of 25 items
  if (gridArray.length === 25 && !Array.isArray(gridArray[0])) {
    const matrix: boolean[][] = [];
    for (let r = 0; r < 5; r++) {
      const row: boolean[] = [];
      for (let c = 0; c < 5; c++) {
        row.push(Boolean(gridArray[r * 5 + c]));
      }
      matrix.push(row);
    }
    return matrix;
  }

  // Case 2: 2D array of rows
  if (Array.isArray(gridArray[0])) {
    return Array(5).fill(null).map((_, r) => {
      const row = Array.isArray(gridArray[r]) ? gridArray[r] : [];
      return Array(5).fill(null).map((_, c) => Boolean(row[c]));
    });
  }

  return Array(5).fill(null).map(() => Array(5).fill(false));
}

export function getSafeCardGrid(rawGrid: any): (string | number)[][] {
  let gridArray: any = rawGrid;
  if (typeof gridArray === 'string') {
    try {
      gridArray = JSON.parse(gridArray);
    } catch {
      gridArray = [];
    }
  }

  if (!Array.isArray(gridArray)) {
    return Array(5).fill(null).map(() => Array(5).fill(''));
  }

  // Case 1: 1D array of 25 items
  if (gridArray.length === 25 && !Array.isArray(gridArray[0])) {
    const matrix: (string | number)[][] = [];
    for (let r = 0; r < 5; r++) {
      const row: (string | number)[] = [];
      for (let c = 0; c < 5; c++) {
        row.push(gridArray[r * 5 + c]);
      }
      matrix.push(row);
    }
    return matrix;
  }

  // Case 2: 2D array of rows
  if (Array.isArray(gridArray[0])) {
    return Array(5).fill(null).map((_, r) => {
      const row = Array.isArray(gridArray[r]) ? gridArray[r] : [];
      return Array(5).fill(null).map((_, c) => row[c] ?? '');
    });
  }

  return Array(5).fill(null).map(() => Array(5).fill(''));
}

export function checkCardPatternMatch(gridInput: any, patternGridInput: any, drawnBalls: number[]) {
  if (!gridInput || !patternGridInput) return { won: false, marked_cells: [] };
  
  const cardGrid = getSafeCardGrid(gridInput);
  const patternGrid = getSafePatternGrid(patternGridInput);
  const marked_cells: {r: number, c: number}[] = [];
  
  for (let r = 0; r < 5; r++) {
    for (let c = 0; c < 5; c++) {
      if (patternGrid[r][c]) {
        const cellValue = cardGrid[r][c];
        const isFree = cellValue === 'FREE' || cellValue === 0 || cellValue === '0';
        if (isFree || drawnBalls.includes(Number(cellValue))) {
          marked_cells.push({ r, c });
        } else {
          return { won: false, marked_cells: [] };
        }
      }
    }
  }
  
  return { won: true, marked_cells };
}

export function getAllWinningCellsForCard(card: any, patterns: any[], drawnBalls: any[]) {
  const allMarkedCells = new Set<string>();
  let hasWonPattern = false;

  if (!card || !card.grid || !patterns || !drawnBalls) return { hasWonPattern, winningCells: allMarkedCells };

  let parsedBalls: number[] = [];
  if (Array.isArray(drawnBalls)) {
    parsedBalls = drawnBalls.map(Number);
  } else if (typeof drawnBalls === 'string') {
    try {
      const parsed = JSON.parse(drawnBalls);
      if (Array.isArray(parsed)) parsedBalls = parsed.map(Number);
    } catch(e) {}
  }

  for (const pattern of patterns) {
    if (!pattern.grid) continue;
    
    // Ignore patterns already won
    if (pattern.winner_player_id) {
      continue;
    }

    const { won, marked_cells } = checkCardPatternMatch(card.grid, pattern.grid, parsedBalls);
    if (won) {
      hasWonPattern = true;
      for (const cell of marked_cells) {
        allMarkedCells.add(`${cell.r}-${cell.c}`);
      }
    }
  }

  return { hasWonPattern, winningCells: allMarkedCells };
}
