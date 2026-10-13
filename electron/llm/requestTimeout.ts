/** Connection / first-response wait. Once output starts, receive until EOF or cancellation. */
export const LLM_REQUEST_TIMEOUT_MS = 60_000;
/** Zero disables the application-level timer between response chunks. */
export const LLM_STREAM_IDLE_TIMEOUT_MS = 0;
