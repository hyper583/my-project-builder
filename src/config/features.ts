/** Feature flags. Milestones B–D flip these on as they land. */
export const FEATURES = {
  aiGeneration: false, // Milestone B
  richTextEditor: false, // Milestone B
  consistencyEngine: false, // Milestone C
  documentExport: false, // Milestone C
  adminDashboard: false, // Milestone D
} as const;

export type FeatureName = keyof typeof FEATURES;
