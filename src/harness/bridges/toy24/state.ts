export interface Toy24State {
  target: number;
  initialNumbers: number[];
  currentNumbers: number[];
  history: string[];
  stopped: boolean;
  success: boolean;
  stepCount: number;
  extras: Record<string, unknown>;
}

export function createToy24State(partial: Partial<Toy24State> = {}): Toy24State {
  return {
    target: 24,
    initialNumbers: [],
    currentNumbers: [],
    history: [],
    stopped: false,
    success: false,
    stepCount: 0,
    extras: {},
    ...partial,
  };
}
