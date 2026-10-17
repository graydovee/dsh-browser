// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest'
import type { BridgeConfigPayload } from '@yuxianglin/dsh-bridge-browser/src/protocol.ts'
import {
  discoverInstances,
  discoveryUrl,
  planDiscovery,
  portOfUrl,
  readBridgeConfig,
} from '../src/background/discovery.ts'

function payload(port: number, extra: Partial<BridgeConfigPayload> = {}): BridgeConfigPayload {
  return { wsUrl: `ws://127.0.0.1:${port}/ext/bridge`, ...extra }
}

/** A probe that answers for the given ports and reports every port it saw. */
function probes(answer: Record<number, BridgeConfigPayload | undefined>) {
  const seen: number[] = []
  return {
    seen,
    probe: async (port: number): Promise<BridgeConfigPayload | undefined> => {
      seen.push(port)
      return answer[port]
    },
  }
}

describe('discoveryUrl / portOfUrl', () => {
  it('builds the loopback config URL and parses the port back out', () => {
    expect(discoveryUrl(43189)).toBe('http://127.0.0.1:43189/ext/bridge-config')
    expect(portOfUrl('ws://127.0.0.1:51801/ext/bridge')).toBe(51801)
    expect(portOfUrl('http://127.0.0.1:3080/ext/bridge')).toBe(3080)
  })

  it('treats unusable addresses as absent', () => {
    expect(portOfUrl(undefined)).toBeUndefined()
    expect(portOfUrl('')).toBeUndefined()
    expect(portOfUrl('nonsense')).toBeUndefined()
    expect(portOfUrl('ws://127.0.0.1/ext/bridge')).toBeUndefined()
  })
})

describe('planDiscovery', () => {
  it('probes the remembered URL first and drops duplicate candidates', () => {
    const plan = planDiscovery({
      rememberedUrl: 'ws://127.0.0.1:3080/ext/bridge',
      sweepPorts: [3080, 50000, 50001],
    })

    expect(plan.groups[0]).toEqual({ source: 'fixed', ports: [3080] })
    expect(plan.groups[1]?.ports).toEqual([3081, 3090, 14389])
    expect(plan.groups[2]?.source).toBe('beacon')
    expect(plan.groups[2]?.ports).toEqual([43189, 43190, 43191, 43192, 43193, 43194, 43195, 43196, 43197, 43198])
    // The sweep never repeats a port a group already covered.
    expect(plan.sweep).toEqual([50000, 50001])
  })

  it('never re-probes the address that just failed', () => {
    const plan = planDiscovery({
      excludeUrl: 'ws://127.0.0.1:3080/ext/bridge',
      sweepPorts: [3080, 50000],
    })

    expect(plan.groups.flatMap((group) => group.ports)).not.toContain(3080)
    expect(plan.sweep).toEqual([50000])
  })
})

describe('discoverInstances', () => {
  it('stops at the first answering group and never sweeps', async () => {
    const { probe, seen } = probes({ 3081: payload(3081) })
    const plan = planDiscovery({ sweepPorts: [50000, 50001] })

    const found = await discoverInstances(plan, { probe, shouldContinue: () => true }, { stopAtFirstHit: true })

    expect(found.map((instance) => instance.wsUrl)).toEqual(['ws://127.0.0.1:3081/ext/bridge'])
    expect(seen).not.toContain(43189)
    expect(seen).not.toContain(50000)
  })

  it('sweeps the range only after every group came up empty', async () => {
    const { probe, seen } = probes({ 50001: payload(50001) })
    const plan = planDiscovery({ sweepPorts: [50000, 50001] })

    const found = await discoverInstances(plan, { probe, shouldContinue: () => true }, { stopAtFirstHit: true })

    expect(found.map((instance) => instance.port)).toEqual([50001])
    expect(seen).toContain(50000)
    expect(found[0]?.sources).toEqual(['scan'])
  })

  it('enumerates every instance, merging the sources that agreed on one URL', async () => {
    // The beacon answers with the real port, which the sweep also finds.
    const beacon: BridgeConfigPayload = { ...payload(51801), beacon: true, pid: 4242, startedAt: '2026-10-18T00:00:00.000Z' }
    const { probe } = probes({ 43189: beacon, 50000: payload(51801), 50001: payload(9000) })
    const plan = planDiscovery({ sweepPorts: [50000, 50001] })

    const found = await discoverInstances(plan, { probe, shouldContinue: () => true }, { stopAtFirstHit: false })

    expect(found).toHaveLength(2)
    expect(found[0]).toMatchObject({ wsUrl: beacon.wsUrl, port: 51801, sources: ['beacon', 'scan'], pid: 4242 })
    expect(found[1]).toMatchObject({ wsUrl: 'ws://127.0.0.1:9000/ext/bridge', sources: ['scan'] })
  })

  it('reports sweep progress with the instances found so far', async () => {
    const { probe } = probes({ 50000: payload(50000) })
    const plan = planDiscovery({ sweepPorts: [50000, 50001, 50002] })
    const progress: Array<{ done: number; total: number; ports: number[] }> = []

    await discoverInstances(plan, {
      probe,
      shouldContinue: () => true,
      onProgress: (report) => {
        progress.push({
          done: report.done,
          total: report.total,
          ports: report.instances.map((instance) => instance.port),
        })
      },
    }, { stopAtFirstHit: false })

    expect(progress[0]).toMatchObject({ done: 0, total: 3 })
    expect(progress.at(-1)).toMatchObject({ done: 3, total: 3, ports: [50000] })
  })

  it('ends the sweep as soon as the caller withdraws', async () => {
    const { probe, seen } = probes({})
    const plan = planDiscovery({ sweepPorts: Array.from({ length: 200 }, (_, index) => 50000 + index) })
    let probesSeen = 0

    const found = await discoverInstances(plan, {
      probe: async (port) => {
        probesSeen += 1
        return await probe(port)
      },
      shouldContinue: () => probesSeen < 40,
    }, { stopAtFirstHit: false })

    expect(found).toEqual([])
    expect(seen.length).toBeLessThan(120)
  })

  it('keeps instances smaller than the probe budget out of the list', async () => {
    // A payload that is not a loopback bridge URL never reaches this layer:
    // readBridgeConfig rejects it, so the runner only sees valid answers.
    const { probe } = probes({ 3080: undefined })
    const plan = planDiscovery({ sweepPorts: [] })

    const found = await discoverInstances(plan, { probe, shouldContinue: () => true }, { stopAtFirstHit: true })

    expect(found).toEqual([])
  })
})

describe('readBridgeConfig', () => {
  it('accepts a loopback answer and keeps its instance metadata', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({
      wsUrl: 'ws://127.0.0.1:43189/ext/bridge',
      beacon: true,
      pid: 77,
      startedAt: '2026-10-18T00:00:00.000Z',
    }), { status: 200 }))

    await expect(readBridgeConfig(43189, 100, fetchImpl as unknown as typeof fetch)).resolves.toEqual({
      wsUrl: 'ws://127.0.0.1:43189/ext/bridge',
      beacon: true,
      pid: 77,
      startedAt: '2026-10-18T00:00:00.000Z',
    })
    expect(fetchImpl).toHaveBeenCalledWith('http://127.0.0.1:43189/ext/bridge-config', expect.anything())
  })

  it('ignores non-2xx answers, foreign URLs, and transport failures', async () => {
    const status = vi.fn(async () => new Response('nope', { status: 404 }))
    await expect(readBridgeConfig(3080, 50, status as unknown as typeof fetch)).resolves.toBeUndefined()

    const foreign = vi.fn(async () => new Response(JSON.stringify({
      wsUrl: 'ws://evil.example:3080/ext/bridge',
    }), { status: 200 }))
    await expect(readBridgeConfig(3080, 50, foreign as unknown as typeof fetch)).resolves.toBeUndefined()

    const broken = vi.fn(async () => { throw new Error('refused') })
    await expect(readBridgeConfig(3080, 50, broken as unknown as typeof fetch)).resolves.toBeUndefined()
  })
})
