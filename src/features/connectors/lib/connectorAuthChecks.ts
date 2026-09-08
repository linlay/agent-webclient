import { getConnectorAuthStatus } from "@/shared/data";

// Page-scoped queue: two background probes and one slot reserved for the selected
// connector. HTTP remains request/response; queued probes never block rendering.
export function createConnectorAuthChecks() {
  type Result = Awaited<ReturnType<typeof getConnectorAuthStatus>>;
  interface Job { id: string; start: () => void; cancel: () => void; }
  const queued: Job[] = [];
  const running = new Set<Job>();
  let priority = "";
  const pump = () => {
    while (running.size < 3 && queued.length) {
      const preferred = queued.findIndex(job => job.id === priority);
      if (running.size >= 2 && preferred < 0) break;
      const [job] = queued.splice(preferred < 0 ? 0 : preferred, 1);
      running.add(job);
      job.start();
    }
  };
  const request = (id: string, signal?: AbortSignal): Promise<Result> => new Promise((resolve, reject) => {
    const controller = new AbortController();
    let settled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const finish = (result?: Result, error?: unknown) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener("abort", abort);
      const index = queued.indexOf(job);
      if (index >= 0) queued.splice(index, 1);
      running.delete(job);
      if (error) reject(error); else resolve(result!);
      pump();
    };
    const abort = () => {
      controller.abort();
      finish(undefined, new DOMException("Aborted", "AbortError"));
    };
    const job: Job = {
      id, cancel: abort,
      start: () => {
        // Queueing time is not network timeout time.
        timer = setTimeout(() => {
          controller.abort();
          finish(undefined, new Error("connectors.auth.error.timeout"));
        }, 20_000);
        try {
          void getConnectorAuthStatus(id, controller.signal).then(result => finish(result), error => finish(undefined, error));
        } catch (error) { finish(undefined, error); }
      },
    };
    if (signal?.aborted) { abort(); return; }
    signal?.addEventListener("abort", abort, { once: true });
    queued.push(job);
    pump();
  });
  return {
    request,
    prioritize: (id: string) => { priority = id; pump(); },
    cancelAll: () => {
      // Empty the waiting queue first so cancellation cannot launch more probes.
      const jobs = [...queued.splice(0), ...running];
      jobs.forEach(job => job.cancel());
    },
  };
}
