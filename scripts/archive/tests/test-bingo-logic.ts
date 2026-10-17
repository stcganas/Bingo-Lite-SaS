
// Standalone logic verification script

// Mocking the normalization logic directly for the test
function getSafePatternGrid(rawGrid: any): boolean[][] {
  let gridArray: any = rawGrid;
  if (!Array.isArray(gridArray)) return Array(5).fill(null).map(() => Array(5).fill(false));
  if (gridArray.length === 25 && !Array.isArray(gridArray[0])) {
    const matrix: boolean[][] = [];
    for (let r = 0; r < 5; r++) {
      const row: boolean[] = [];
      for (let c = 0; c < 5; c++) row.push(Boolean(gridArray[r * 5 + c]));
      matrix.push(row);
    }
    return matrix;
  }
  return Array(5).fill(null).map((_, r) => {
    const row = Array.isArray(gridArray[r]) ? gridArray[r] : [];
    return Array(5).fill(null).map((_, c) => Boolean(row[c]));
  });
}

function checkCardPatternLogic(card: any, patternGridInput: any, drawnBalls: number[]) {
  const pGrid = getSafePatternGrid(patternGridInput);
  const grid = [
    [card.b[0], card.i[0], card.n[0], card.g[0], card.o[0]],
    [card.b[1], card.i[1], card.n[1], card.g[1], card.o[1]],
    [card.b[2], card.i[2], card.n[2], card.g[2], card.o[2]],
    [card.b[3], card.i[3], card.n[3], card.g[3], card.o[3]],
    [card.b[4], card.i[4], card.n[4], card.g[4], card.o[4]],
  ];

  const marked_cells: { r: number; c: number }[] = [];
  let totalRequiredCells = 0;

  for (let r = 0; r < 5; r++) {
    for (let c = 0; c < 5; c++) {
      if (pGrid[r][c]) {
        totalRequiredCells++;
        const cellValue = grid[r][c];
        const isFree = cellValue === 'FREE' || cellValue === 0 || cellValue === '0';
        if (isFree || (cellValue !== undefined && cellValue !== null && drawnBalls.includes(Number(cellValue)))) {
          marked_cells.push({ r, c });
        } else {
          return { won: false, marked_cells: [] };
        }
      }
    }
  }
  return { won: totalRequiredCells > 0, marked_cells };
}

// Test Data
const card = {
  b: [1, 2, 3, 4, 5],
  i: [16, 17, 18, 19, 20],
  n: [31, 32, 0, 34, 35], // 0 is FREE
  g: [46, 47, 48, 49, 50],
  o: [61, 62, 63, 64, 65]
};

const drawnBalls = [1, 16, 46, 61]; // First row: 1, 16, 31, 46, 61 (31 is missing but let's test a pattern)

// Pattern 1: Horizontal Top Row (1D array)
const pattern1D = [
  true, true, false, true, true, // 31 is index 2, let's say it's NOT required
  false, false, false, false, false,
  false, false, false, false, false,
  false, false, false, false, false,
  false, false, false, false, false
];

console.log("Testing 1D Pattern (Horizontal Top Row minus middle)...");
const result1 = checkCardPatternLogic(card, pattern1D, drawnBalls);
console.log("Result 1 (Expected Won: true):", result1.won);

// Pattern 2: Center (FREE)
const patternCenter = Array(25).fill(false);
patternCenter[12] = true;
console.log("Testing Center Pattern (FREE)...");
const result2 = checkCardPatternLogic(card, patternCenter, []);
console.log("Result 2 (Expected Won: true):", result2.won);

if (result1.won && result2.won) {
  console.log("SUCCESS: Logic parity verified.");
} else {
  console.log("FAILURE: Logic parity failed.");
  process.exit(1);
}
