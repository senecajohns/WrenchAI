// OBD-II Service for WrenchAI
// Handles Bluetooth connection and ELM327 command communication

import { BleManager } from 'react-native-ble-plx';
import { Platform, PermissionsAndroid } from 'react-native';
import { Buffer } from 'buffer';

// Known UUID profiles for common OBD-II BLE dongles, tried in order
const UUID_PROFILES = [
  {
    name: 'Generic ELM327',
    service: '0000fff0-0000-1000-8000-00805f9b34fb',
    tx: '0000fff1-0000-1000-8000-00805f9b34fb',
    rx: '0000fff2-0000-1000-8000-00805f9b34fb',
  },
  {
    name: 'Veepeak OBDCheck BLE',
    service: '49535343-fe7d-4ae5-8fa9-9fafd205e455',
    tx: '49535343-1fe4-4b5e-8a1e-7b5c5a5f3e28',
    rx: '49535343-8841-43f4-a8d4-ecbe34729bb3',
  },
  {
    name: 'OBDLink / ScanTool',
    service: 'e7810a71-73ae-499d-8c15-faa9aef0c3f2',
    tx: 'be90798a-7664-4f2c-a8d0-f3c0c64b2598',
    rx: 'be90798a-7664-4f2c-a8d0-f3c0c64b2598',
  },
  {
    name: 'Generic BLE Serial (FFE0)',
    service: '0000ffe0-0000-1000-8000-00805f9b34fb',
    tx: '0000ffe1-0000-1000-8000-00805f9b34fb',
    rx: '0000ffe1-0000-1000-8000-00805f9b34fb',
  },
];

// ELM327 responses that indicate no real data
const NODATA_RESPONSES = ['NO DATA', 'UNABLE TO CONNECT', 'BUS INIT', 'BUS BUSY', 'FB ERROR', 'DATA ERROR', 'ERR'];

class OBDService {
  constructor() {
    this.bleManager = new BleManager();
    this.device = null;
    this.isConnected = false;
    this.responseBuffer = '';
    this.responsePromiseResolve = null;
    this.activeProfile = null;
  }

  async requestPermissions() {
    if (Platform.OS === 'android') {
      const granted = await PermissionsAndroid.requestMultiple([
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
        PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
      ]);

      const allGranted = Object.values(granted).every(
        status => status === PermissionsAndroid.RESULTS.GRANTED
      );

      if (!allGranted) {
        throw new Error('Bluetooth permissions not granted');
      }
    }
    return true;
  }

  async scanForDevices(timeoutMs = 7000) {
    await this.requestPermissions();

    const devices = [];
    const deviceIds = new Set();

    return new Promise((resolve, reject) => {
      this.bleManager.startDeviceScan(null, { allowDuplicates: false }, (error, device) => {
        if (error) {
          reject(error);
          return;
        }

        if (device.name && !deviceIds.has(device.id)) {
          const name = device.name.toUpperCase();
          if (
            name.includes('OBD') ||
            name.includes('ELM') ||
            name.includes('VEEPEAK') ||
            name.includes('VLINK') ||
            name.includes('OBDII') ||
            name.includes('SCAN') ||
            name.includes('KIWI') ||
            name.includes('PLX')
          ) {
            deviceIds.add(device.id);
            devices.push({ id: device.id, name: device.name });
          }
        }
      });

      setTimeout(() => {
        this.bleManager.stopDeviceScan();
        resolve(devices);
      }, timeoutMs);
    });
  }

  async connect(deviceId) {
    try {
      const connected = await this.bleManager.connectToDevice(deviceId, {
        timeout: 10000,
        autoConnect: false,
      });
      await connected.discoverAllServicesAndCharacteristics();
      this.device = connected;

      // Find which UUID profile this dongle uses
      const profile = await this._detectProfile();
      if (!profile) {
        await connected.cancelConnection();
        return { success: false, error: 'Unsupported OBD dongle. Could not find a compatible Bluetooth service.' };
      }

      this.activeProfile = profile;
      this.isConnected = true;

      await this._setupNotifications();
      await this._initELM327();

      return { success: true, device: connected, profileName: profile.name };
    } catch (error) {
      this.isConnected = false;
      this.device = null;
      this.activeProfile = null;
      return { success: false, error: error.message };
    }
  }

  // Walk known profiles until we find one whose service exists on the device
  async _detectProfile() {
    const services = await this.device.services();
    const serviceUUIDs = services.map(s => s.uuid.toLowerCase());

    for (const profile of UUID_PROFILES) {
      if (serviceUUIDs.includes(profile.service.toLowerCase())) {
        return profile;
      }
    }

    // Last resort: find any service with a writable + notifiable characteristic pair
    for (const service of services) {
      try {
        const chars = await service.characteristics();
        const writable = chars.find(c => c.isWritableWithResponse || c.isWritableWithoutResponse);
        const notifiable = chars.find(c => c.isNotifiable || c.isIndicatable);
        if (writable && notifiable) {
          return {
            name: 'Auto-detected',
            service: service.uuid,
            tx: writable.uuid,
            rx: notifiable.uuid,
          };
        }
      } catch (_) {
        // skip services we can't inspect
      }
    }

    return null;
  }

  async _setupNotifications() {
    const { service, rx } = this.activeProfile;
    this.device.monitorCharacteristicForService(service, rx, (error, characteristic) => {
      if (error) return;

      if (characteristic?.value) {
        const decoded = Buffer.from(characteristic.value, 'base64').toString('utf-8');
        this.responseBuffer += decoded;

        if (this.responseBuffer.includes('>')) {
          if (this.responsePromiseResolve) {
            this.responsePromiseResolve(this.responseBuffer.trim());
            this.responsePromiseResolve = null;
            this.responseBuffer = '';
          }
        }
      }
    });
  }

  async _initELM327() {
    // Full reset — ELM327 takes up to 1s to reboot
    await this._rawCommand('ATZ', 1500);

    // Core init sequence; each command verifies the adapter is responding
    const initCmds = [
      'ATE0',   // Echo off
      'ATL0',   // Linefeeds off
      'ATS1',   // Spaces on (makes parsing unambiguous)
      'ATH0',   // Headers off
      'ATAT1',  // Adaptive timing on
      'ATSP0',  // Auto-detect protocol
    ];

    for (const cmd of initCmds) {
      const resp = await this._rawCommand(cmd, 1000);
      if (!resp || resp.includes('?')) {
        // Non-fatal: some clones ignore unknown AT commands
        console.warn(`ELM327 init warning: "${cmd}" → "${resp}"`);
      }
    }
  }

  async disconnect() {
    if (this.device) {
      try { await this.device.cancelConnection(); } catch (_) {}
      this.device = null;
    }
    this.isConnected = false;
    this.activeProfile = null;
    this.responseBuffer = '';
    this.responsePromiseResolve = null;
  }

  // Internal raw write — no retry, variable timeout
  async _rawCommand(command, timeout = 3000) {
    if (!this.isConnected || !this.device) throw new Error('Not connected to OBD device');

    this.responseBuffer = '';
    const encoded = Buffer.from(command + '\r').toString('base64');

    await this.device.writeCharacteristicWithResponseForService(
      this.activeProfile.service,
      this.activeProfile.tx,
      encoded
    );

    return this._waitForResponse(timeout);
  }

  async _waitForResponse(timeout) {
    return new Promise(resolve => {
      this.responsePromiseResolve = resolve;
      setTimeout(() => {
        if (this.responsePromiseResolve) {
          this.responsePromiseResolve = null;
          const partial = this.responseBuffer.trim();
          this.responseBuffer = '';
          resolve(partial || 'NO DATA');
        }
      }, timeout);
    });
  }

  // Public command with retry; throws on hard failure
  async sendCommand(command, retries = 2, timeout = 3000) {
    let lastResponse = '';
    for (let attempt = 0; attempt <= retries; attempt++) {
      const response = await this._rawCommand(command, timeout);
      lastResponse = response;

      const upper = response.toUpperCase();
      // If ELM returned an unknown command marker keep retrying; for NO DATA that's a valid answer
      if (upper.includes('?') && attempt < retries) {
        await this._delay(300);
        continue;
      }
      return response;
    }
    return lastResponse;
  }

  // --- Public OBD commands ---

  async getVIN() {
    const response = await this.sendCommand('0902', 2, 5000);
    return this._parseVIN(response);
  }

  // Returns { confirmed, pending, permanent } arrays
  async getAllDTCs() {
    const [confirmed, pending, permanent] = await Promise.all([
      this.sendCommand('03').then(r => this._parseDTCResponse(r, '43')),
      this.sendCommand('07').then(r => this._parseDTCResponse(r, '47')),
      this.sendCommand('0A').then(r => this._parseDTCResponse(r, '4A')),
    ]);
    return { confirmed, pending, permanent };
  }

  // Legacy single-call for backwards compat
  async getDTCs() {
    const { confirmed } = await this.getAllDTCs();
    return confirmed;
  }

  async clearDTCs() {
    return this.sendCommand('04');
  }

  // --- Parsers ---

  _parseVIN(rawResponse) {
    try {
      // Split into lines; each line is either a single-frame or a numbered multi-frame segment
      const lines = rawResponse.split(/[\r\n]/).map(l => l.trim()).filter(Boolean);

      let hexData = '';

      for (const line of lines) {
        if (line === '>' || line === '') continue;

        // Strip multi-frame segment index (e.g. "0:", "1:", "2:")
        const noIndex = line.replace(/^[0-9A-Fa-f]:/, '');

        // Strip spaces
        const compact = noIndex.replace(/\s/g, '');

        // Eat mode/PID response header bytes "490201", "490202", etc. and any leading length byte
        // Pattern: optional 3-digit hex length, then 490201-490209
        const stripped = compact.replace(/^[0-9A-Fa-f]{3}49020[0-9]/i, '')
                                  .replace(/^49020[0-9]/i, '');

        hexData += stripped;
      }

      // Remove any non-hex characters that slipped through
      hexData = hexData.replace(/[^0-9A-Fa-f]/g, '');

      // Convert hex pairs to ASCII, keep only printable characters
      let vin = '';
      for (let i = 0; i + 1 < hexData.length; i += 2) {
        const code = parseInt(hexData.substr(i, 2), 16);
        if (code >= 0x20 && code <= 0x7E && code !== 0x00) {
          vin += String.fromCharCode(code);
        }
      }

      // VIN is always 17 alphanumeric chars; find the first 17-char substring if extra garbage crept in
      const match = vin.match(/[A-HJ-NPR-Z0-9]{17}/i);
      return match ? match[0].toUpperCase() : null;
    } catch (e) {
      console.warn('VIN parse error:', e);
      return null;
    }
  }

  _parseDTCResponse(rawResponse, expectedHeader) {
    const dtcs = [];
    if (!rawResponse) return dtcs;

    const upper = rawResponse.toUpperCase();
    if (NODATA_RESPONSES.some(nd => upper.includes(nd))) return dtcs;

    try {
      const lines = rawResponse.split(/[\r\n]/).map(l => l.trim()).filter(Boolean);

      for (const line of lines) {
        if (line === '>') continue;

        // Remove frame index prefix if present
        const noIndex = line.replace(/^[0-9A-Fa-f]:\s*/,'');
        const compact = noIndex.replace(/\s/g, '').toUpperCase();

        // Skip lines that don't contain the expected response header
        // Also handle lines that start with it
        const headerIdx = compact.indexOf(expectedHeader);
        if (headerIdx === -1) continue;

        // Everything after the header byte + count byte
        // Header = 2 chars (1 byte), count = 2 chars (1 byte)
        let payload = compact.substring(headerIdx + 4); // skip header + count byte

        // Each DTC is 4 hex chars (2 bytes)
        for (let i = 0; i + 3 < payload.length; i += 4) {
          const dtcHex = payload.substr(i, 4);
          if (dtcHex === '0000') continue;
          const decoded = this._decodeDTC(dtcHex);
          if (decoded) {
            dtcs.push({ code: decoded, type: this._dtcType(expectedHeader) });
          }
        }
      }
    } catch (e) {
      console.warn('DTC parse error:', e);
    }

    return dtcs;
  }

  _decodeDTC(hex) {
    if (hex.length !== 4) return null;
    const firstNibble = parseInt(hex[0], 16);
    if (isNaN(firstNibble)) return null;

    const typeMap = [
      'P0','P1','P2','P3',
      'C0','C1','C2','C3',
      'B0','B1','B2','B3',
      'U0','U1','U2','U3',
    ];
    const prefix = typeMap[firstNibble] ?? 'P0';
    const suffix = hex.substring(1).toUpperCase();
    return prefix + suffix;
  }

  _dtcType(header) {
    const map = { '43': 'confirmed', '47': 'pending', '4A': 'permanent' };
    return map[header.toUpperCase()] ?? 'unknown';
  }

  _delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

export default new OBDService();
