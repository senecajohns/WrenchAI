// OBD-II Service for WrenchAI
// Handles Bluetooth connection and ELM327 command communication

import { BleManager } from 'react-native-ble-plx';
import { Platform, PermissionsAndroid } from 'react-native';
import { Buffer } from 'buffer'; // npm install buffer

const SERVICE_UUID = '0000fff0-0000-1000-8000-00805f9b34fb';
const TX_UUID = '0000fff1-0000-1000-8000-00805f9b34fb';
const RX_UUID = '0000fff2-0000-1000-8000-00805f9b34fb';

class OBDService {
  constructor() {
    this.bleManager = new BleManager();
    this.device = null;
    this.isConnected = false;
    this.responseBuffer = '';
    this.responsePromiseResolve = null;
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
    // iOS handles permissions via Info.plist
    return true;
  }

  async scanForDevices() {
    await this.requestPermissions();
    
    const devices = [];
    const deviceIds = new Set(); // Prevent duplicates
    
    return new Promise((resolve, reject) => {
      this.bleManager.startDeviceScan(null, null, (error, device) => {
        if (error) {
          console.log('Scan error:', error);
          reject(error);
          return;
        }
        
        // Look for OBD devices, avoid duplicates
        if (device.name && !deviceIds.has(device.id) &&
            (device.name.includes('OBD') || 
             device.name.includes('ELM') || 
             device.name.includes('Veepeak') ||
             device.name.includes('Link') ||
             device.name.includes('OBDII'))) {
          deviceIds.add(device.id);
          devices.push(device);
          console.log('Found OBD device:', device.name, device.id);
        }
      });

      setTimeout(() => {
        this.bleManager.stopDeviceScan();
        resolve(devices);
      }, 5000);
    });
  }

  async connect(deviceId) {
    try {
      const device = await this.bleManager.connectToDevice(deviceId);
      await device.discoverAllServicesAndCharacteristics();
      
      this.device = device;
      this.isConnected = true;
      
      // Set up notification listener for responses
      await this.setupNotifications();
      
      // Initialize OBD
      await this.sendCommand('ATZ');   // Reset
      await this.delay(1000);
      await this.sendCommand('ATE0');  // Echo off
      await this.sendCommand('ATL0');  // Line feeds off
      await this.sendCommand('ATS0');  // Spaces off
      await this.sendCommand('ATSP0'); // Auto protocol
      
      return { success: true, device };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async setupNotifications() {
    this.device.monitorCharacteristicForService(
      SERVICE_UUID,
      RX_UUID,
      (error, characteristic) => {
        if (error) {
          console.log('Notification error:', error);
          return;
        }
        
        if (characteristic?.value) {
          const decoded = Buffer.from(characteristic.value, 'base64').toString('utf-8');
          this.responseBuffer += decoded;
          
          // Check if response is complete (ends with >)
          if (this.responseBuffer.includes('>')) {
            if (this.responsePromiseResolve) {
              this.responsePromiseResolve(this.responseBuffer.trim());
              this.responsePromiseResolve = null;
              this.responseBuffer = '';
            }
          }
        }
      }
    );
  }

  async disconnect() {
    if (this.device) {
      await this.device.cancelConnection();
      this.isConnected = false;
      this.device = null;
      this.responseBuffer = '';
    }
  }

  async sendCommand(command) {
    if (!this.isConnected || !this.device) {
      throw new Error('Not connected to OBD device');
    }

    this.responseBuffer = '';
    const fullCommand = command + '\r';
    const encoded = Buffer.from(fullCommand).toString('base64');
    
    await this.device.writeCharacteristicWithResponseForService(
      SERVICE_UUID,
      TX_UUID,
      encoded
    );

    return await this.readResponse();
  }

  async readResponse(timeout = 3000) {
    return new Promise((resolve, reject) => {
      this.responsePromiseResolve = resolve;
      
      setTimeout(() => {
        if (this.responsePromiseResolve) {
          this.responsePromiseResolve = null;
          // Return whatever we have, or empty
          resolve(this.responseBuffer.trim() || 'NO DATA');
          this.responseBuffer = '';
        }
      }, timeout);
    });
  }

  async getVIN() {
    const response = await this.sendCommand('0902');
    return this.parseVIN(response);
  }

  async getDTCs() {
    const response = await this.sendCommand('03');
    return this.parseDTCs(response);
  }

  async clearDTCs() {
    return await this.sendCommand('04');
  }

  parseVIN(rawResponse) {
    // VIN response format varies by protocol
    // Remove headers and spaces, extract ASCII
    try {
      const cleaned = rawResponse
        .replace(/[\r\n>]/g, '')
        .replace(/49 02 0[0-9]/g, '') // Remove mode/PID headers
        .replace(/[^0-9A-Fa-f]/g, '');
      
      // Convert hex pairs to ASCII
      let vin = '';
      for (let i = 0; i < cleaned.length; i += 2) {
        const charCode = parseInt(cleaned.substr(i, 2), 16);
        if (charCode >= 32 && charCode <= 126) {
          vin += String.fromCharCode(charCode);
        }
      }
      
      // VIN should be 17 characters
      if (vin.length >= 17) {
        return vin.substring(0, 17);
      }
      return null;
    } catch (e) {
      console.log('VIN parse error:', e);
      return null;
    }
  }

  parseDTCs(rawResponse) {
    const dtcs = [];
    
    try {
      const cleaned = rawResponse
        .replace(/[\r\n>]/g, '')
        .replace(/43/g, '') // Remove mode 03 response header
        .replace(/[^0-9A-Fa-f]/g, '');
      
      // Each DTC is 4 hex characters (2 bytes)
      for (let i = 0; i < cleaned.length; i += 4) {
        const dtcHex = cleaned.substr(i, 4);
        if (dtcHex.length === 4 && dtcHex !== '0000') {
          const dtcCode = this.decodeDTC(dtcHex);
          if (dtcCode) {
            dtcs.push({ code: dtcCode, description: '' });
          }
        }
      }
    } catch (e) {
      console.log('DTC parse error:', e);
    }
    
    return dtcs;
  }

  decodeDTC(hex) {
    // First character determines type: P, C, B, U
    const firstNibble = parseInt(hex[0], 16);
    const typeMap = ['P0', 'P1', 'P2', 'P3', 'C0', 'C1', 'C2', 'C3', 
                     'B0', 'B1', 'B2', 'B3', 'U0', 'U1', 'U2', 'U3'];
    const prefix = typeMap[firstNibble] || 'P0';
    const suffix = hex.substring(1).toUpperCase();
    return prefix + suffix;
  }

  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

export default new OBDService();
