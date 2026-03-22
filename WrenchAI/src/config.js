// WrenchAI Configuration
// Add your API keys here (in production, use environment variables or secure storage)

export const CONFIG = {
  // Venice AI API Key
  // Get yours at: https://venice.ai
  VENICE_API_KEY: '',
  
  // Default AI model
  DEFAULT_MODEL: 'llama-3.3-70b',
  
  // OBD-II Bluetooth configuration
  OBD: {
    SCAN_TIMEOUT: 5000,        // 5 seconds
    SERVICE_UUID: '0000fff0-0000-1000-8000-00805f9b34fb',
    TX_UUID: '0000fff1-0000-1000-8000-00805f9b34fb',
    RX_UUID: '0000fff2-0000-1000-8000-00805f9b34fb',
  },
  
  // Parts affiliate configuration
  AFFILIATES: {
    ENABLED: true,
    DEFAULT_PARTNER: 'autozone', // or 'rockauto', 'advance', etc.
  },
  
  // Feature flags
  FEATURES: {
    AI_INTERPRETATION: true,
    MANUAL_VIN_ENTRY: true,
    RECALLS_CHECK: true,
  },
};
