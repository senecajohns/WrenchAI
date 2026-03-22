// OBD-II Service for WrenchAI
// Handles Bluetooth connection and ELM327 command communication

import { BleManager, BleError, Device } from 'react-native-ble-plx';

const SERVICE_UUID = '0000fff0-0000-1000-8000-00805f9b34fb'; // Common ELM327 service
const TX_UUID = '0000fff1-0000-1000-8000-00805f9b34fb';       // Transmit
const RX_UUID = '0000fff2-0000-1000-8000-00805f9b34fb';       // Receive

class OBDService {
  constructor() {
    this.bleManager = new BleManager();
    this.device = null;
    this.isConnected = false;
  }

  async scanForDevices() {
    const devices = [];
    
    return new Promise((resolve) => {
      this.bleManager.startDeviceScan(null, null, (error, device) => {
        if (error) {
          console.log('Scan error:', error);
          return;
        }
        
        // Look for OBD devices (often have "OBD", "ELM", "Veepeak", "OBDLink" in name)
        if (device.name && 
            (device.name.includes('OBD') || 
             device.name.includes('ELM') || 
             device.name.includes('Veepeak') ||
             device.name.includes('Link'))) {
          devices.push(device);
          console.log('Found OBD device:', device.name, device.id);
        }
      });

      // Stop scan after 5 seconds
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
      
      // Initialize OBD
      await this.sendCommand('ATZ');   // Reset
      await this.delay(1000);
      await this.sendCommand('ATE0');  // Echo off
      await this.sendCommand('ATL1');  // Line feeds on
      
      return { success: true, device };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async disconnect() {
    if (this.device) {
      await this.device.cancelConnection();
      this.isConnected = false;
      this.device = null;
    }
  }

  async sendCommand(command) {
    if (!this.isConnected || !this.device) {
      throw new Error('Not connected to OBD device');
    }

    // ELM327 commands need carriage return
    const fullCommand = command + '\r';
    
    // Write to TX characteristic
    await this.device.writeCharacteristicWithResponseForService(
      SERVICE_UUID,
      TX_UUID,
      Buffer.from(fullCommand).toString('base64')
    );

    // Read response (simplified - real impl needs subscription)
    return await this.readResponse();
  }

  async readResponse() {
    // Simplified - real implementation needs to handle async notifications
    return new Promise((resolve) => {
      setTimeout(() => {
        resolve('> READY'); // Placeholder
      }, 500);
    });
  }

  async getVIN() {
    // Mode 09 PID 02 = VIN
    const response = await this.sendCommand('0902');
    // Parse VIN from response (complex multi-frame parsing needed)
    return this.parseVIN(response);
  }

  async getDTCs() {
    // Mode 03 = Stored DTCs
    const response = await this.sendCommand('03');
    return this.parseDTCs(response);
  }

  async clearDTCs() {
    // Mode 04 = Clear DTCs
    return await this.sendCommand('04');
  }

  parseVIN(rawResponse) {
    // TODO: Implement proper VIN parsing from multi-frame response
    // VIN is spread across multiple CAN frames
    return 'PARSING_NOT_IMPLEMENTED';
  }

  parseDTCs(rawResponse) {
    // Parse DTCs from mode 03 response
    // Format: PXXXX, BXXXX, CXXXX, UXXXX
    const dtcs = [];
    // TODO: Implement actual parsing
    return dtcs;
  }

  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

export default new OBDService();
