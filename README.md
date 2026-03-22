# WrenchAI

AI-powered DIY car repair assistant with OBD-II diagnostics.

## What It Does

1. **Connect** to your car via Bluetooth OBD-II dongle
2. **Read** diagnostic trouble codes (DTCs) and VIN
3. **Interpret** codes with AI
4. **Guide** you through repairs
5. **Link** to parts you need

## Project Structure

```
wrenchai/
├── WrenchAI/          # React Native mobile app
│   ├── src/
│   │   ├── services/  # OBD, NHTSA, AI, Parts
│   │   ├── screens/   # UI screens
│   │   └── utils/
│   ├── App.js         # Main entry
│   └── app.json       # Expo config
│
└── backend/           # Node.js API
    └── server.js      # Proxies AI calls
```

## Quick Start

### Prerequisites

- Node.js 20+
- Expo CLI: `npm install -g expo-cli`
- Venice AI API key: https://venice.ai

### 1. Backend Setup

```bash
cd backend
cp .env.example .env
# Edit .env with your Venice API key
npm install
npm start
```

Backend runs on http://localhost:3000

### 2. Mobile App Setup

```bash
cd WrenchAI
npm install
```

Update `src/config.js` with your backend URL.

### 3. Run on Device

```bash
# Start Expo
npx expo start

# Scan QR code with Expo Go app on your phone
```

## Hardware Required

- **OBD-II Bluetooth dongle** (ELM327 compatible)
  - Recommended: Veepeak, OBDLink LX, or similar
  - Avoid super cheap clones (connectivity issues)

## Features

| Feature | Status |
|---------|--------|
| Bluetooth OBD connection | ✅ Basic |
| VIN auto-read | ⚠️ Partial |
| DTC reading | ✅ Basic |
| AI interpretation | ✅ Via backend |
| Parts affiliate links | ✅ |
| Repair instructions | ✅ Via backend |

## Testing

1. Plug OBD dongle into car port (usually under dash)
2. Turn ignition to ON (don't need to start engine)
3. Open app, tap "Scan for OBD Device"
4. Select device when found
5. View codes and AI analysis

## What's Missing (TODO)

- [ ] Full VIN multi-frame parsing
- [ ] Complete DTC parsing (different protocols)
- [ ] Real-time sensor data (live PIDs)
- [ ] Offline mode with cached responses
- [ ] iOS/Android native app builds (currently Expo Go only)
- [ ] App Store submission

## Architecture

```
Phone (React Native)
├── Bluetooth → OBD-II Dongle → Car ECU
└── HTTP → Backend API → Venice AI

Backend (Node.js)
├── Receives DTCs from phone
└── Calls Venice AI for interpretation
```

## Cost

- **Venice AI**: $0-50/mo (free tier available)
- **OBD Dongle**: $20-50 (one-time)
- **Hosting**: $0 (local dev) or $5-20/mo (cloud)

## License

MIT - Built for the DIY community.
