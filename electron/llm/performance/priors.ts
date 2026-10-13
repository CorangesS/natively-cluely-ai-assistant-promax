import { LLM_REQUEST_TIMEOUT_MS } from '../requestTimeout';
// electron/llm/performance/priors.ts
//
// Shipped priors — what Natively expects from a provider it has never measured.
//
// THE PRIOR IS THE CURRENT BEHAVIOUR, and that is the whole design. Phase 0
// rule 20 says "preserve current behavior as the fallback when calibration has
// insufficient confidence", and the cheapest way to guarantee that is to DERIVE
// each prior from the constant that governs today rather than to write a second
// set of numbers beside it. A prior that drifts from the shipped default is a
// silent behaviour change on every fresh install; a prior that is defined as the
// shipped default cannot drift.
//
// Phase 8 also says "do not hardcode fake precision. Use broad priors rather
// than misleading exact values." So there is exactly ONE knob per route, no
// per-model latency guesses, and no invented p50s. A model-family table of
// "expected TTFT" would be fabricated precision — we have no measurements for
// most of these, and the profile exists precisely to acquire them.

import {
  LIVE_LOCAL_TOTAL_HARD_TIMEOUT_MS,
  LIVE_VISION_TOTAL_HARD_TIMEOUT_MS,
  LIVE_TOTAL_HARD_TIMEOUT_MS,
  LIVE_USER_ENDPOINT_TOTAL_HARD_TIMEOUT_MS,
  LIVE_DEFAULT_PROVIDER_TOTAL_HARD_TIMEOUT_MS,
  LIVE_INTER_TOKEN_STALL_MS,
} from '../liveDeadlines';
import type { RouteKind } from './types';

/**
 * The first-token ceiling a route gets with no evidence at all.
 *
 * Identical, by construction, to `totalHardTimeoutMs`'s route table. If that
 * table changes, this changes with it.
 */
export const ROUTE_TTFT_PRIOR_MS: Record<RouteKind, number> = {
  local: LIVE_LOCAL_TOTAL_HARD_TIMEOUT_MS,
  vision: LIVE_VISION_TOTAL_HARD_TIMEOUT_MS,
  server_cascade: LIVE_TOTAL_HARD_TIMEOUT_MS,
  user_endpoint: LIVE_USER_ENDPOINT_TOTAL_HARD_TIMEOUT_MS,
  default_provider: LIVE_DEFAULT_PROVIDER_TOTAL_HARD_TIMEOUT_MS,
};

/**
 * The stream-idle bound a route gets with no evidence.
 *
 * One number for every route today, because that is literally what ships:
 * `LIVE_INTER_TOKEN_STALL_MS` is passed unconditionally at every call site. The
 * per-route shape exists so that evidence can pull the routes apart — a local
 * model's inter-token gap genuinely differs from a hosted one's — without a
 * second migration when it does.
 */
export const ROUTE_STREAM_IDLE_PRIOR_MS: Record<RouteKind, number> = {
  local: LIVE_INTER_TOKEN_STALL_MS,
  vision: LIVE_INTER_TOKEN_STALL_MS,
  server_cascade: LIVE_INTER_TOKEN_STALL_MS,
  user_endpoint: LIVE_INTER_TOKEN_STALL_MS,
  default_provider: LIVE_INTER_TOKEN_STALL_MS,
};

/** Fixed 60-second user-request budget; latency measurements cannot shorten it. */
export const STREAM_IDLE_MIN_MS = LLM_REQUEST_TIMEOUT_MS;
export const STREAM_IDLE_MAX_MS = LIVE_INTER_TOKEN_STALL_MS;

/**
 * Multiplier applied to the observed worst healthy gap.
 *
 * NOT chosen a priori — Phase 11 explicitly says "do not hardcode the exact
 * multiplier until analysis of the existing code and actual latency behaviour".
 * The analysis available is the file's own measurement of a fully healthy
 * stream: liveDeadlines records a live capture of 8047 tokens over 61s flowing
 * "continuously" with no client guard firing, i.e. an entire healthy answer
 * whose gaps stayed far below 8000ms. The guard's job is to sit above the worst
 * gap a healthy stream produces and below the point where the user has given
 * up.
 *
 * 3x the decayed worst healthy gap, then clamped. 3 rather than 2 because the
 * input is already a maximum (not a mean), so the headroom is multiplying a
 * tail, not a centre — and a 2x margin over a tail is the "1.4s above an 11.6s
 * observed tail is a coin flip" geometry this codebase has been bitten by twice.
 */
export const STREAM_IDLE_GAP_MULTIPLIER = 3;

/**
 * Minimum healthy streams before the stall guard may NARROW below its prior.
 *
 * Mirrors `USER_ENDPOINT_MIN_SAMPLES_TO_NARROW` in liveDeadlines, and for the
 * identical reason: narrowing is the direction that can kill a turn that was
 * about to succeed. Widening is not gated because widening cannot.
 */
export const STREAM_IDLE_MIN_SAMPLES_TO_NARROW = 5;

/**
 * Bounds on the adaptive TTFT ceiling, per route.
 *
 * `min` is the floor evidence may never take a route below; `max` is the ceiling
 * it may never exceed. Both are expressed against the shipped constants so the
 * adaptive value can only ever move INSIDE the range the route table already
 * considers sane.
 *
 * `server_cascade` is pinned: min === max === the shipped value. This is not
 * conservatism, it is the F-301 invariant. That route's 13000 is derived as
 * "natively-api's 10s provider cutover + 3s for the next leg", and narrowing it
 * would put the client back to abandoning turns before the server can rotate —
 * the exact defect `DeadlineBudgetOrdering2026_08_10` exists to prevent.
 * Measurement has nothing to correct on a route whose number is derived from a
 * mechanism we can read rather than guess.
 */
export const ROUTE_TTFT_BOUNDS: Record<RouteKind, { min: number; max: number }> = {
  local: { min: LIVE_LOCAL_TOTAL_HARD_TIMEOUT_MS, max: LIVE_LOCAL_TOTAL_HARD_TIMEOUT_MS },
  vision: { min: LIVE_VISION_TOTAL_HARD_TIMEOUT_MS, max: LIVE_VISION_TOTAL_HARD_TIMEOUT_MS },
  server_cascade: { min: LIVE_TOTAL_HARD_TIMEOUT_MS, max: LIVE_TOTAL_HARD_TIMEOUT_MS },
  // The only route that already adapts today, with the bounds it already uses.
  user_endpoint: { min: LIVE_DEFAULT_PROVIDER_TOTAL_HARD_TIMEOUT_MS, max: LIVE_VISION_TOTAL_HARD_TIMEOUT_MS },
  default_provider: {
    min: LIVE_DEFAULT_PROVIDER_TOTAL_HARD_TIMEOUT_MS,
    max: LIVE_DEFAULT_PROVIDER_TOTAL_HARD_TIMEOUT_MS,
  },
};

/**
 * Which routes may have their TTFT ceiling moved by evidence at all.
 *
 * Only `user_endpoint`, which is where it already moves. Every other route's
 * number is derived from something known about the transport — a cold weight
 * load, an image prefill, a server-side cutover, a direct call with nothing
 * behind it — rather than guessed, so there is nothing for measurement to
 * correct. Widening this set is a deliberate, separately-flagged decision, not
 * a consequence of collecting more data.
 *
 * The profile still RECORDS every route. Recording is not adapting, and keeping
 * those two separable is what lets diagnostics tell a user their Gemini is slow
 * without that observation silently rewriting a deadline.
 */
export const TTFT_ADAPTIVE_ROUTES: ReadonlySet<RouteKind> = new Set<RouteKind>(['user_endpoint']);

/**
 * Which routes may have their STALL GUARD moved by evidence.
 *
 * Everything except `local`, and local's exclusion is the same argument that
 * already gives it a 30s TTFT ceiling instead of 8s. An on-device model does not
 * behave like a hosted one mid-stream: it competes with everything else on the
 * machine, and a thermally-throttled laptop, a memory-pressured swap, or another
 * app taking the GPU can genuinely stall generation for seconds without the
 * model being dead. Five fast healthy streams would put the guard at its 2500ms
 * floor, and the next throttled generation would be killed before the decaying
 * max could widen it back.
 *
 * The failure modes are not symmetric either. A hosted stream that goes quiet
 * for 8s is almost certainly gone — nothing on the far end is "thinking" in a
 * way we cannot see. A local one may simply be slow this minute. So local keeps
 * the flat shipped constant, which is the conservative and correct answer for a
 * process running on the user's own hardware.
 */
export const STREAM_IDLE_ADAPTIVE_ROUTES: ReadonlySet<RouteKind> =
  new Set<RouteKind>(['vision', 'server_cascade', 'user_endpoint', 'default_provider']);


/** Fixed 60-second user-request budget; latency measurements cannot shorten it. */
export const CONNECT_MIN_TIMEOUT_MS = LLM_REQUEST_TIMEOUT_MS;
export const CONNECT_MAX_TIMEOUT_MS = LLM_REQUEST_TIMEOUT_MS;

/**
 * Headroom over the slowest connect actually observed.
 *
 * 2x rather than a fixed margin because connect latency scales with the
 * network rather than with the provider — a handshake that takes 900ms on
 * hotel wifi can take 1.8s on the next attempt for reasons neither end
 * controls. A multiplier tracks that; a fixed +2000ms would be generous at
 * 200ms and thin at 3s.
 */
export const CONNECT_MARGIN_MULTIPLIER = 2;
