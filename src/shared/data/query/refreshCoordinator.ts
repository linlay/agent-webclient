/** Serializes reads and preserves changes arriving during a read. React-free. */
export class RefreshCoordinator<T> {
  private version = 0;
  private task: { promise: Promise<T | undefined>; dirty: boolean } | null = null;
  private operation?: { fetch: () => Promise<T>; publish: (value: T) => void; fail: (error: unknown) => void };
  get busy() { return this.task !== null; }
  cancel(invalidate: () => void) {
    this.version++;
    this.task = null;
    invalidate();
  }
  read(fetch: () => Promise<T>, invalidate: () => void, publish: (value: T) => void,
    fail: (error: unknown) => void, changed = false): Promise<T | undefined> {
    this.operation = { fetch, publish, fail };
    if (changed) {
      this.version++;
      invalidate();
      if (this.task) this.task.dirty = true;
    }
    if (this.task) return this.task.promise;
    const task = { promise: null as unknown as Promise<T | undefined>, dirty: false };
    this.task = task;
    task.promise = Promise.resolve().then(async () => {
      let value: T | undefined;
      do {
        if (this.task !== task) return;
        task.dirty = false;
        const version = this.version;
        const operation = this.operation!;
        try {
          value = await operation.fetch();
          if (version === this.version) operation.publish(value);
        } catch (error) {
          if (version === this.version) operation.fail(error);
        }
      } while (this.task === task && task.dirty);
      return this.task === task ? value : undefined;
    }).finally(() => { if (this.task === task) this.task = null; });
    return task.promise;
  }
}
