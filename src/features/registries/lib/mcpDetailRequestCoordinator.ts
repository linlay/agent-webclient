export interface McpDetailRequestSelection<T> {
  promise: Promise<T>;
  selectionId: number;
}

export interface McpDetailRequestCoordinator<T> {
  invalidate: () => void;
  isLatest: (selectionId: number) => boolean;
  run: (
    key: string,
    requestFactory: () => Promise<T>,
  ) => McpDetailRequestSelection<T>;
}

export function createMcpDetailRequestCoordinator<T>(): McpDetailRequestCoordinator<T> {
  const inFlight = new Map<string, Promise<T>>();
  let latestSelectionId = 0;

  const clearRequest = (key: string, request: Promise<T>) => {
    if (inFlight.get(key) === request) {
      inFlight.delete(key);
    }
  };

  return {
    invalidate: () => {
      latestSelectionId += 1;
    },
    isLatest: (selectionId) => selectionId === latestSelectionId,
    run: (key, requestFactory) => {
      const selectionId = ++latestSelectionId;
      let request = inFlight.get(key);
      if (!request) {
        try {
          request = requestFactory();
        } catch (error) {
          request = Promise.reject(error);
        }
        const createdRequest = request;
        inFlight.set(key, createdRequest);
        void createdRequest.then(
          () => clearRequest(key, createdRequest),
          () => clearRequest(key, createdRequest),
        );
      }
      return { promise: request, selectionId };
    },
  };
}
