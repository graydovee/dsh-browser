/**
 * Loopback port ranges worth sweeping for a local dsh, plus the budgets that
 * keep one sweep bounded.
 *
 * DSH Desktop launches its host with `--port 0`, so the OS assigns the port
 * from its ephemeral range: 49152–65535 on Windows and macOS, 32768–60999 on
 * Linux by default. The plugin's discovery beacon covers current builds; the
 * sweep is the fallback for a host that predates the beacon or could not bind
 * one of its ports. Sweeps run only when the user opens the panel or asks for
 * the instance list — never on a timer.
 *
 * @module
 */

/** One inclusive port range to probe. */
export interface PortRange {
  start: number
  end: number
}

/**
 * Concurrent probes in one sweep. Loopback refusals return immediately, so a
 * modest fan-out finishes a full range in a few seconds without swamping the
 * network stack of a small machine.
 */
export const SWEEP_CONCURRENCY = 64

/** Per-probe budget; a listening loopback port answers in milliseconds. */
export const SWEEP_PROBE_TIMEOUT_MS = 400

/** Wall-clock budget for one sweep, after which the remaining ports are skipped. */
export const SWEEP_DEADLINE_MS = 20_000

/**
 * Ephemeral port ranges for the current platform.
 * @param os - `chrome.runtime.getPlatformInfo().os`, or undefined when unknown.
 * @returns ranges to probe, in ascending order.
 */
export function sweepRanges(os: string | undefined): PortRange[] {
  switch (os) {
    case 'linux':
    case 'cros':
      return [{ start: 32768, end: 60999 }]
    case 'win':
    case 'mac':
    case 'openbsd':
    case 'fuchsia':
      return [{ start: 49152, end: 65535 }]
    default:
      // Unknown platform: cover both conventions with one superset range.
      return [{ start: 32768, end: 65535 }]
  }
}

/**
 * Every port of the given ranges, ascending and deduplicated.
 * @param ranges - ranges from {@link sweepRanges}.
 */
export function rangePorts(ranges: readonly PortRange[]): number[] {
  const seen = new Set<number>()
  const ports: number[] = []
  for (const range of ranges) {
    for (let port = range.start; port <= range.end; port += 1) {
      if (seen.has(port)) continue
      seen.add(port)
      ports.push(port)
    }
  }
  return ports.sort((left, right) => left - right)
}
