// @vitest-environment jsdom

import { describe, expect, it } from 'vitest'
import {
  SWEEP_CONCURRENCY,
  SWEEP_DEADLINE_MS,
  SWEEP_PROBE_TIMEOUT_MS,
  rangePorts,
  sweepRanges,
} from '../src/background/port-scan.ts'

describe('sweepRanges', () => {
  it('uses the ephemeral range the platform assigns from', () => {
    expect(sweepRanges('win')).toEqual([{ start: 49152, end: 65535 }])
    expect(sweepRanges('mac')).toEqual([{ start: 49152, end: 65535 }])
    expect(sweepRanges('linux')).toEqual([{ start: 32768, end: 60999 }])
  })

  it('covers both conventions when the platform is unknown', () => {
    expect(sweepRanges(undefined)).toEqual([{ start: 32768, end: 65535 }])
    expect(sweepRanges('plan9')).toEqual([{ start: 32768, end: 65535 }])
  })
})

describe('rangePorts', () => {
  it('lists every port of the range once, ascending', () => {
    const ports = rangePorts([{ start: 50000, end: 50004 }, { start: 50002, end: 50006 }])
    expect(ports).toEqual([50000, 50001, 50002, 50003, 50004, 50005, 50006])
  })

  it('produces the full platform range', () => {
    expect(rangePorts(sweepRanges('win'))).toHaveLength(16384)
    expect(rangePorts(sweepRanges('linux'))).toHaveLength(60999 - 32768 + 1)
  })
})

describe('sweep budgets', () => {
  it('stay within a single interaction', () => {
    expect(SWEEP_CONCURRENCY).toBeGreaterThan(0)
    expect(SWEEP_CONCURRENCY).toBeLessThanOrEqual(256)
    expect(SWEEP_PROBE_TIMEOUT_MS).toBeLessThanOrEqual(SWEEP_DEADLINE_MS)
    // A sweep must finish in seconds, not minutes, or the panel would hang.
    expect(SWEEP_DEADLINE_MS).toBeLessThanOrEqual(30_000)
  })
})
