export type ActionDispatch<Action> = (action: Action) => void;

export type StateUpdate<State> = State | ((previous: State) => State);

export type StateSetter<State> = (update: StateUpdate<State>) => void;

export interface MutableValueRef<Value> {
  current: Value;
}
