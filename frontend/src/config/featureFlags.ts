export const featureFlags = {
  navigation: {
    showEmail: true,
    showEmailSequences: true,
    showOutreachConnections: true,
    showOutreachScenarios: true,
    showOutreachRuns: true,
    showOutreachTemplates: true,
    showForecasting: false,
    showDataImport: false,
    showMindMapping: true,
  },
} as const;

export type FeatureFlags = typeof featureFlags;
