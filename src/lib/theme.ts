/**
 * Theme constants shared across the server/client boundary.
 *
 * Deliberately its own module: every export of a `"use client"` file becomes
 * a client reference when a server component imports it, so the storage key
 * would not survive the trip into the root layout's pre-paint script.
 */

export type Theme = "light" | "dark" | "system";

/** Read by the pre-paint script in the root layout and by the provider. */
export const THEME_STORAGE_KEY = "mpb-theme";
