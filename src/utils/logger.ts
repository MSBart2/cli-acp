export function logger(namespace: string, verbose: boolean = false) {
  return {
    log: (message: string) => {
      if (verbose) {
        console.error(`[${namespace}] ${message}`);
      }
    },
    error: (message: string) => {
      console.error(`[${namespace}] ERROR: ${message}`);
    },
    info: (message: string) => {
      console.log(`[${namespace}] ${message}`);
    },
  };
}
