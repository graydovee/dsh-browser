/**
 * CORS headers shared by the two discovery endpoints (`/ext/bridge-config` on
 * the host webserver and the same path on the fixed-port beacon).
 *
 * Chromium 142+ and Edge 143+ Local Network Access route an extension's fetch
 * to loopback through the CORS checks, so a discovery answer without these
 * headers is unreadable and the side panel reports "no service found" while
 * the WebSocket itself (not subject to CORS) would have connected fine.
 *
 * The answers carry no secret — only the bridge WebSocket URL plus instance
 * metadata — and authentication still happens on the WebSocket handshake
 * (pinned extension origin or bearer token), so a wildcard origin is safe. The
 * beacon keeps its `Host` check against DNS rebinding.
 *
 * @module @yuxianglin/dsh-bridge-browser/src/discovery-cors
 */

import type { ServerResponse } from 'node:http'

/** Headers every discovery answer and preflight carries. */
export const DISCOVERY_CORS_HEADERS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, OPTIONS',
  'access-control-allow-private-network': 'true',
} as const

/**
 * Answer a discovery CORS preflight in place.
 * @param method - request method from the incoming message.
 * @param res - response to write the 204 into.
 * @returns true when the request was a preflight and has been answered.
 */
export function answerDiscoveryPreflight(method: string | undefined, res: ServerResponse): boolean {
  if (method !== 'OPTIONS') return false
  res.writeHead(204, DISCOVERY_CORS_HEADERS)
  res.end()
  return true
}
