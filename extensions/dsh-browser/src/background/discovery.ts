/**
 * Bridge discovery for the side panel.
 *
 * DSH Desktop launches its host with `--port 0`, so the local Web port changes
 * on every launch. Discovery therefore runs in two stages:
 *
 * 1. a bounded group of known ports — the URL that worked last time, the
 *    `dsh web` defaults, and the plugin's fixed discovery beacon;
 * 2. one sweep of the platform's ephemeral range, which is where the OS puts a
 *    host that has no beacon (an older plugin, or a beacon port already taken).
 *
 * The startup pass stops at the first answer; the settings page enumerates
 * everything so the user can pick between several local instances. Nothing here
 * schedules itself: the caller decides when a pass runs.
 *
 * @module
 */

import {
  BEACON_PORTS,
  LEGACY_BRIDGE_PORTS,
  BRIDGE_CONFIG_PATH,
  parseBridgeConfigPayload,
  type BridgeConfigPayload,
} from '@yuxianglin/dsh-bridge-browser/src/protocol.ts'
import { SWEEP_CONCURRENCY, SWEEP_DEADLINE_MS, SWEEP_PROBE_TIMEOUT_MS } from './port-scan.ts'

/** How long one known-port probe may take before it counts as absent. */
export const GROUP_PROBE_TIMEOUT_MS = 1_500

/** How often a sweep reports progress. */
const PROGRESS_INTERVAL_MS = 250

/** Where a discovered instance came from. */
export type InstanceSource = 'fixed' | 'beacon' | 'scan'

/** One reachable dsh bridge. */
export interface BridgeInstance {
  /** Bridge WebSocket URL, as advertised by the host. */
  wsUrl: string
  /** Port of that URL, for display and ordering. */
  port: number
  /** Every path that found it; more than one means the answers agreed. */
  sources: InstanceSource[]
  /** Host process id, when the plugin advertises it. */
  pid?: number
  /** Host start time (ISO 8601), when the plugin advertises it. */
  startedAt?: string
}

/** Progress of one discovering pass. */
export interface DiscoveryProgress {
  /** Ports probed so far. */
  done: number
  /** Ports this pass intends to probe. */
  total: number
  /** Instances found so far, in discovery order. */
  instances: BridgeInstance[]
}

/** Side effects one pass needs; all injectable so the runner stays testable. */
export interface DiscoveryEnv {
  /** Read the discovery answer of one port, or `undefined` when nothing answers. */
  probe(port: number, timeoutMs: number): Promise<BridgeConfigPayload | undefined>
  /** Whether the caller still wants results (panel lease, user cancellation). */
  shouldContinue(): boolean
  /** Called while a sweep runs, throttled. */
  onProgress?(progress: DiscoveryProgress): void
}

/** One ordered batch of probes. */
export interface DiscoveryGroup {
  source: InstanceSource
  ports: readonly number[]
}

/** What one pass should probe, in order. */
export interface DiscoveryPlan {
  groups: DiscoveryGroup[]
  /** Ports to sweep after the groups. */
  sweep: number[]
}

/** Inputs for {@link planDiscovery}. */
export interface DiscoveryPlanOptions {
  /** URL that worked last time; probed before the fixed list. */
  rememberedUrl?: string
  /** URL already tried and known to fail, never probed again. */
  excludeUrl?: string
  /** Ports of the platform's ephemeral range (see `port-scan.ts`). */
  sweepPorts: readonly number[]
}

/** Loopback URL of one port's discovery endpoint. */
export function discoveryUrl(port: number): string {
  return `http://127.0.0.1:${port}${BRIDGE_CONFIG_PATH}`
}

/** Port of a bridge URL, or `undefined` when it does not parse. */
export function portOfUrl(url: string | undefined): number | undefined {
  if (url === undefined || url === '') return undefined
  try {
    const port = Number(new URL(url).port)
    return Number.isInteger(port) && port > 0 ? port : undefined
  } catch {
    return undefined
  }
}

/**
 * Read one discovery answer and validate it.
 * @param port - loopback port to ask.
 * @param timeoutMs - per-probe budget.
 * @param fetchImpl - injectable fetch.
 * @returns the advertised instance, or `undefined` when the port is not a dsh bridge.
 */
export async function readBridgeConfig(
  port: number,
  timeoutMs: number,
  fetchImpl: typeof fetch = fetch,
): Promise<BridgeConfigPayload | undefined> {
  try {
    const response = await fetchImpl(discoveryUrl(port), { signal: AbortSignal.timeout(timeoutMs) })
    if (!response.ok) return undefined
    return parseBridgeConfigPayload(await response.json())
  } catch {
    return undefined
  }
}

/**
 * Build the probe order for one pass.
 *
 * The remembered URL comes first (the common case: the next launch reused a
 * port), then the `dsh web` defaults, then the beacon block. Ports appearing
 * twice are probed once.
 * @param options - remembered URL, an address to skip, and the sweep ports.
 * @returns groups plus a sweep list that excludes what the groups already cover.
 */
export function planDiscovery(options: DiscoveryPlanOptions): DiscoveryPlan {
  const probed = new Set<number>()
  const excluded = portOfUrl(options.excludeUrl)
  if (excluded !== undefined) probed.add(excluded)
  const groups: DiscoveryGroup[] = []
  const push = (source: InstanceSource, ports: readonly number[]): void => {
    const fresh = ports.filter((port) => !probed.has(port))
    for (const port of fresh) probed.add(port)
    if (fresh.length > 0) groups.push({ source, ports: fresh })
  }
  const remembered = portOfUrl(options.rememberedUrl)
  if (remembered !== undefined) push('fixed', [remembered])
  push('fixed', LEGACY_BRIDGE_PORTS)
  push('beacon', BEACON_PORTS)
  return {
    groups,
    sweep: options.sweepPorts.filter((port) => !probed.has(port)),
  }
}

/**
 * Run one discovery pass.
 * @param plan - probe order from {@link planDiscovery}.
 * @param env - probe, cancellation, and progress hooks.
 * @param options - `stopAtFirstHit` ends the pass as soon as a group answers (startup).
 * @returns every instance found, in discovery order.
 */
export async function discoverInstances(
  plan: DiscoveryPlan,
  env: DiscoveryEnv,
  options: { stopAtFirstHit: boolean },
): Promise<BridgeInstance[]> {
  const found = new Map<string, BridgeInstance>()
  const record = (payload: BridgeConfigPayload, source: InstanceSource): void => {
    const existing = found.get(payload.wsUrl)
    if (existing === undefined) {
      found.set(payload.wsUrl, {
        wsUrl: payload.wsUrl,
        port: portOfUrl(payload.wsUrl) ?? 0,
        sources: [source],
        ...(payload.pid === undefined ? {} : { pid: payload.pid }),
        ...(payload.startedAt === undefined ? {} : { startedAt: payload.startedAt }),
      })
      return
    }
    if (!existing.sources.includes(source)) existing.sources.push(source)
  }
  const snapshot = (): BridgeInstance[] => [...found.values()]

  for (const group of plan.groups) {
    if (!env.shouldContinue()) return snapshot()
    const answers = await Promise.all(group.ports.map(async port => ({
      payload: await env.probe(port, GROUP_PROBE_TIMEOUT_MS),
    })))
    for (const { payload } of answers) {
      if (payload !== undefined) record(payload, group.source)
    }
    if (options.stopAtFirstHit && found.size > 0) return snapshot()
  }

  if (plan.sweep.length > 0 && env.shouldContinue()) {
    await sweepPorts(plan.sweep, env, record, snapshot)
  }
  return snapshot()
}

/**
 * Probe a port list with bounded concurrency, collecting every answer.
 * @param ports - ports to probe, in ascending order.
 * @param env - probe and cancellation hooks.
 * @param record - sink for one accepted answer.
 * @param snapshot - current instance list, for progress reporting.
 */
async function sweepPorts(
  ports: readonly number[],
  env: DiscoveryEnv,
  record: (payload: BridgeConfigPayload, source: InstanceSource) => void,
  snapshot: () => BridgeInstance[],
): Promise<void> {
  const startedAt = Date.now()
  const total = ports.length
  let next = 0
  let done = 0
  let lastEmit = 0
  const emit = (force: boolean): void => {
    if (env.onProgress === undefined) return
    const now = Date.now()
    if (!force && now - lastEmit < PROGRESS_INTERVAL_MS) return
    lastEmit = now
    env.onProgress({ done, total, instances: snapshot() })
  }
  emit(true)
  const worker = async (): Promise<void> => {
    for (;;) {
      if (!env.shouldContinue()) return
      if (Date.now() - startedAt > SWEEP_DEADLINE_MS) return
      const index = next
      next += 1
      if (index >= ports.length) return
      const payload = await env.probe(ports[index] as number, SWEEP_PROBE_TIMEOUT_MS)
      done += 1
      if (payload !== undefined) {
        record(payload, 'scan')
        emit(true)
      } else {
        emit(false)
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(SWEEP_CONCURRENCY, ports.length) }, worker))
  emit(true)
}
