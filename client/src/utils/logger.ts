export type LogLevel = "debug" | "info" | "warn" | "error";

export interface LogEntry {
  /** ISO timestamp of the entry. */
  timestamp: string;
  /** Area of the app the entry comes from, e.g. `collection-save`. */
  scope: string;
  level: LogLevel;
  message: string;
  data?: Record<string, unknown>;
}

export interface Logger {
  debug: (message: string, data?: Record<string, unknown>) => void;
  info: (message: string, data?: Record<string, unknown>) => void;
  warn: (message: string, data?: Record<string, unknown>) => void;
  error: (message: string, data?: Record<string, unknown>) => void;
  /**
   * Starts a timer. The returned function logs the message with the elapsed `durationMs` (and optional data) on the
   * given level (default `info`) and returns the duration.
   */
  time: () => (message: string, data?: Record<string, unknown>, level?: LogLevel) => number;
}

const LEVEL_ORDER: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3 };

/** Maximum number of entries kept in memory. Older entries are dropped. */
const BUFFER_SIZE: number = 500;

const minLevel: LogLevel = (import.meta.env.VITE_LOG_LEVEL as LogLevel | undefined) ?? (import.meta.env.DEV ? "debug" : "warn");

const buffer: LogEntry[] = [];

// In development, the entries can be inspected in the browser console, e.g. via `console.table(__misoLogs)`
if (import.meta.env.DEV) {
  (window as unknown as { __misoLogs: LogEntry[] }).__misoLogs = buffer;
}

function write(entry: LogEntry): void {
  if (LEVEL_ORDER[entry.level] < LEVEL_ORDER[minLevel]) {
    return;
  }

  buffer.push(entry);

  if (buffer.length > BUFFER_SIZE) {
    buffer.shift();
  }

  console[entry.level](`[${entry.scope}] ${entry.message}`, entry.data ?? "");
}

/**
 * Creates a logger for the given scope. Entries below the configured level (`VITE_LOG_LEVEL`, default `debug` in
 * development and `warn` in production) are dropped.
 *
 * @param {string} scope - Area of the app the entries come from. Is prefixed to every message.
 * @returns {Logger} The logger.
 */
export function createLogger(scope: string): Logger {
  function log(level: LogLevel, message: string, data?: Record<string, unknown>): void {
    write({ timestamp: new Date().toISOString(), scope, level, message, data });
  }

  return {
    debug: (message, data) => log("debug", message, data),
    info: (message, data) => log("info", message, data),
    warn: (message, data) => log("warn", message, data),
    error: (message, data) => log("error", message, data),
    time: () => {
      const start: number = performance.now();

      return (message, data, level = "info") => {
        const durationMs: number = Math.round(performance.now() - start);

        log(level, message, { ...data, durationMs });

        return durationMs;
      };
    },
  };
}
