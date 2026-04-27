// WrenchAI Configuration

export const CONFIG = {
  // Backend API URL
  // In development this hits localhost; set EXPO_PUBLIC_API_URL in .env for production
  API_BASE_URL: process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000',

  // OBD scan timeout in milliseconds
  OBD: {
    SCAN_TIMEOUT: 7000,
  },

  // Parts affiliate configuration
  AFFILIATES: {
    ENABLED: true,
    DEFAULT_PARTNER: 'autozone',
  },

  // Feature flags
  FEATURES: {
    AI_INTERPRETATION: true,
    MANUAL_VIN_ENTRY: true,
    RECALLS_CHECK: true,
  },
};
