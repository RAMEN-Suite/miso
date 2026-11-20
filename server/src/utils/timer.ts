import logger from "../logger.js";

/**
 * Measures the phases of an operation and logs them as one line, for finding out where time goes. Not meant to stay in
 * the code once a question is answered.
 *
 * ```ts
 * const timer = new Timer("Write");
 * const result = await timer.measure("write", () => tx.run(query, params));
 * const graph = timer.measure("resolve", () => toElementGraph(context, stored));
 * timer.log({ nodes: graph.nodes.length });
 * // Write: 120.4 ms total, write 30.2 ms, resolve 12.0 ms, rest 78.2 ms { nodes: 42 }
 * ```
 *
 * Phases of the same name add up. Phases shouldn't overlap (nested phases are counted twice); `rest` is the time spent
 * outside of them.
 */
export class Timer {
  private readonly started: number = performance.now();
  private readonly phases = new Map<string, number>();
  private readonly label: string;

  /**
   * @param {string} label - The name of the operation, the start of the log line.
   */
  constructor(label: string) {
    this.label = label;
  }

  /**
   * Runs a phase and adds its duration. Works for synchronous and asynchronous work; a phase that throws is counted
   * too.
   *
   * @param {string} name - The name of the phase.
   * @param {() => T} work - The work of the phase.
   * @returns {T} The result of the work (the promise, for asynchronous work).
   */
  public measure<T>(name: string, work: () => T): T {
    const started: number = performance.now();
    let result: T;

    try {
      result = work();
    } catch (error: unknown) {
      this.add(name, started);
      throw error;
    }

    if (result instanceof Promise) {
      return result.finally(() => this.add(name, started)) as T;
    }

    this.add(name, started);

    return result;
  }

  /**
   * Logs the total, each phase in the order they first ran, and the rest (`info` level).
   *
   * @param {Record<string, unknown>} [details] - Further numbers for the log line, e.g. how much data was processed.
   */
  public log(details?: Record<string, unknown>): void {
    const total: number = performance.now() - this.started;
    const measured: number = [...this.phases.values()].reduce((sum, duration) => sum + duration, 0);
    const phases: string = [...this.phases.entries()].map(([name, duration]) => `, ${name} ${Timer.format(duration)}`).join("");

    logger.info(`${this.label}: ${Timer.format(total)} total${phases}, rest ${Timer.format(total - measured)}`, details);
  }

  private add(name: string, started: number): void {
    this.phases.set(name, (this.phases.get(name) ?? 0) + performance.now() - started);
  }

  private static format(duration: number): string {
    return `${duration.toFixed(1)} ms`;
  }
}
