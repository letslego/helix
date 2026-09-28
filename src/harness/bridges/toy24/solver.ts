const EPS = 1e-6;
const OPS = ["add", "sub", "mul", "div"] as const;

function apply(op: string, a: number, b: number): number | null {
  if (op === "add") return a + b;
  if (op === "sub") return a - b;
  if (op === "mul") return a * b;
  if (op === "div") {
    if (Math.abs(b) < EPS) return null;
    return a / b;
  }
  return null;
}

export function hasSolution(
  numbers: number[],
  target = 24,
  allowedOps: readonly string[] = OPS,
): boolean {
  if (!numbers.length) return false;
  if (numbers.length === 1) return Math.abs(numbers[0] - target) < EPS;

  for (let i = 0; i < numbers.length; i++) {
    for (let j = 0; j < numbers.length; j++) {
      if (i === j) continue;
      const rest = numbers.filter((_, k) => k !== i && k !== j);
      for (const op of allowedOps) {
        const v = apply(op, numbers[i], numbers[j]);
        if (v === null) continue;
        if (hasSolution([...rest, v], target, allowedOps)) return true;
      }
    }
  }
  return false;
}

const EASY_PUZZLES = [
  [8, 8, 3, 3], [6, 6, 6, 6], [4, 4, 6, 6], [3, 3, 8, 8],
  [2, 4, 4, 8], [1, 5, 5, 5], [2, 2, 6, 8], [3, 4, 4, 6],
];
const MEDIUM_PUZZLES = [
  [3, 3, 7, 7], [1, 4, 6, 6], [2, 3, 5, 12], [4, 6, 6, 8],
  [1, 2, 3, 4], [2, 5, 5, 10], [1, 3, 4, 6], [2, 2, 4, 9],
];
const HARD_PUZZLES = [
  [3, 3, 8, 8], [1, 3, 4, 6], [3, 7, 8, 9], [4, 7, 8, 8],
  [5, 5, 5, 1], [3, 8, 3, 8], [6, 7, 8, 9], [3, 4, 5, 6],
];
const UNSOLVABLE = [
  [1, 1, 1, 1], [2, 2, 2, 2], [1, 1, 1, 2], [1, 1, 2, 3],
];

export function generatePuzzle(
  difficulty = "easy",
  target = 24,
  allowUnsolvable = false,
  rng = Math.random,
): number[] {
  const pool =
    difficulty === "medium" ? MEDIUM_PUZZLES :
    difficulty === "hard" ? HARD_PUZZLES :
    EASY_PUZZLES;
  if (allowUnsolvable && rng() < 0.3) {
    return [...UNSOLVABLE[Math.floor(rng() * UNSOLVABLE.length)]];
  }
  return [...pool[Math.floor(rng() * pool.length)]];
}

export { EPS, OPS };
