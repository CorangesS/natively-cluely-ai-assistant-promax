/** User-facing LLM requests allow 60 seconds to connect, start, or resume output.
 * This is an inactivity budget, not a cap on a continuously streaming answer.
 * Background classification, downloads, and cleanup keep their own limits.
 */
export const LLM_REQUEST_TIMEOUT_MS = 60_000;
