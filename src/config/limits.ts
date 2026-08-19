/** Operational limits that are not plan-dependent. */
export const LIMITS = {
  upload: {
    maxBytes: Number(process.env.MAX_UPLOAD_MB ?? 25) * 1024 * 1024,
    /** Accepted upload types. Extension alone is never trusted — magic bytes are checked too. */
    accepted: {
      "application/pdf": [".pdf"],
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [".docx"],
      "text/plain": [".txt"],
      "image/png": [".png"],
      "image/jpeg": [".jpg", ".jpeg"],
    } as const,
  },
  wizard: {
    /** Debounce before an autosave fires, in milliseconds. */
    autosaveDebounceMs: 800,
  },
  rateLimit: {
    /** Fixed-window buckets: [max requests, window seconds]. */
    authAttempt: [10, 900] as const,
    upload: [30, 3600] as const,
    aiAction: [60, 3600] as const,
  },
} as const;
