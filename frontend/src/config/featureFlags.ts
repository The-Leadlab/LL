export const featureFlags = {
  navigation: {
    showEmail: true,
    showEmailSequences: true,
    showForecasting: false,
    showDataImport: false,
    showMindMapping: true,
  },
} as const;

export type FeatureFlags = typeof featureFlags;
