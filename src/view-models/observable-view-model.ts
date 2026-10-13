export class ObservableViewModel<State> {
  protected state: State;

  private readonly listeners = new Set<() => void>();

  constructor(initialState: State) {
    this.state = initialState;
  }

  getSnapshot = (): State => this.state;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  protected updateState(patch: Partial<State>): void {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((listener) => listener());
  }
}