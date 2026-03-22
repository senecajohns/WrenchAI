import { StatusBar } from 'expo-status-bar';
import { StyleSheet, Text, View } from 'react-native';

import React, { useState, useEffect } from 'react';
import { 
  StyleSheet, 
  Text, 
  View, 
  TouchableOpacity, 
  ScrollView,
  ActivityIndicator,
  Alert 
} from 'react-native';
import { StatusBar } from 'expo-status-bar';

// Services
import obdService from './src/services/obdService';
import nhtsaService from './src/services/nhtsaService';
import aiService from './src/services/aiService';

export default function App() {
  const [isScanning, setIsScanning] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [deviceName, setDeviceName] = useState('');
  const [vehicleInfo, setVehicleInfo] = useState(null);
  const [dtcs, setDtcs] = useState([]);
  const [aiInterpretation, setAiInterpretation] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const scanForOBD = async () => {
    setIsScanning(true);
    try {
      const devices = await obdService.scanForDevices();
      if (devices.length > 0) {
        // For MVP, auto-connect to first found device
        const device = devices[0];
        await connectToDevice(device.id, device.name);
      } else {
        Alert.alert('No OBD devices found', 'Make sure your OBD dongle is powered on and in range.');
      }
    } catch (error) {
      Alert.alert('Scan Error', error.message);
    } finally {
      setIsScanning(false);
    }
  };

  const connectToDevice = async (deviceId, name) => {
    setIsLoading(true);
    try {
      const result = await obdService.connect(deviceId);
      if (result.success) {
        setIsConnected(true);
        setDeviceName(name);
        
        // Get VIN and decode
        await readVehicleData();
      } else {
        Alert.alert('Connection Failed', result.error);
      }
    } catch (error) {
      Alert.alert('Connection Error', error.message);
    } finally {
      setIsLoading(false);
    }
  };

  const readVehicleData = async () => {
    try {
      // Get VIN from OBD
      const vin = await obdService.getVIN();
      
      if (vin && vin !== 'PARSING_NOT_IMPLEMENTED') {
        // Decode VIN with NHTSA
        const vinData = await nhtsaService.decodeVINValues(vin);
        if (vinData.success) {
          setVehicleInfo(vinData.data);
        }
      }

      // Get DTCs
      const codes = await obdService.getDTCs();
      setDtcs(codes);

      // Get AI interpretation
      if (codes.length > 0) {
        const interpretation = await aiService.interpretDTCs(codes, vehicleInfo);
        if (interpretation.success) {
          setAiInterpretation(interpretation.interpretation);
        }
      }
    } catch (error) {
      console.error('Error reading vehicle data:', error);
    }
  };

  const disconnect = async () => {
    await obdService.disconnect();
    setIsConnected(false);
    setDeviceName('');
    setVehicleInfo(null);
    setDtcs([]);
    setAiInterpretation('');
  };

  return (
    <View style={styles.container}>
      <StatusBar style="light" />
      
      <View style={styles.header}>
        <Text style={styles.title}>WrenchAI</Text>
        <Text style={styles.subtitle}>AI-Powered Car Diagnostics</Text>
      </View>

      <ScrollView style={styles.content}>
        {/* Connection Status */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>OBD Connection</Text>
          {isConnected ? (
            <View>
              <Text style={styles.connectedText}>✓ Connected to {deviceName}</Text>
              <TouchableOpacity style={styles.buttonSecondary} onPress={disconnect}>
                <Text style={styles.buttonText}>Disconnect</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity 
              style={styles.button} 
              onPress={scanForOBD}
              disabled={isScanning || isLoading}
            >
              {isScanning || isLoading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.buttonText}>Scan for OBD Device</Text>
              )}
            </TouchableOpacity>
          )}
        </View>

        {/* Vehicle Info */}
        {vehicleInfo && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Vehicle Info</Text>
            <Text style={styles.vehicleText}>
              {vehicleInfo.ModelYear} {vehicleInfo.Make} {vehicleInfo.Model}
            </Text>
            {vehicleInfo.Trim && (
              <Text style={styles.detailText}>Trim: {vehicleInfo.Trim}</Text>
            )}
            {vehicleInfo.EngineModel && (
              <Text style={styles.detailText}>Engine: {vehicleInfo.EngineModel}</Text>
            )}
          </View>
        )}

        {/* DTCs */}
        {dtcs.length > 0 && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Diagnostic Codes</Text>
            {dtcs.map((dtc, index) => (
              <View key={index} style={styles.dtcRow}>
                <Text style={styles.dtcCode}>{dtc.code}</Text>
                <Text style={styles.dtcDescription}>{dtc.description}</Text>
              </View>
            ))}
          </View>
        )}

        {/* AI Interpretation */}
        {aiInterpretation ? (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>AI Analysis</Text>
            <Text style={styles.aiText}>{aiInterpretation}</Text>
          </View>
        ) : null}

        {/* Manual VIN Entry (fallback) */}
        {!isConnected && !vehicleInfo && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Manual Entry</Text>
            <Text style={styles.hintText}>
              Don't have an OBD device? Enter your VIN manually for vehicle info.
            </Text>
            {/* TODO: Add VIN input field */}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1a1a2e',
  },
  header: {
    paddingTop: 60,
    paddingBottom: 20,
    paddingHorizontal: 20,
    backgroundColor: '#16213e',
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#e94560',
  },
  subtitle: {
    fontSize: 14,
    color: '#a0a0a0',
    marginTop: 4,
  },
  content: {
    flex: 1,
    padding: 16,
  },
  card: {
    backgroundColor: '#0f3460',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 12,
  },
  button: {
    backgroundColor: '#e94560',
    borderRadius: 8,
    padding: 14,
    alignItems: 'center',
  },
  buttonSecondary: {
    backgroundColor: '#533483',
    borderRadius: 8,
    padding: 12,
    alignItems: 'center',
    marginTop: 8,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  connectedText: {
    color: '#4caf50',
    fontSize: 14,
    marginBottom: 8,
  },
  vehicleText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
  detailText: {
    color: '#a0a0a0',
    fontSize: 14,
    marginTop: 4,
  },
  dtcRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#1a1a2e',
  },
  dtcCode: {
    color: '#e94560',
    fontSize: 14,
    fontWeight: '600',
    width: 80,
  },
  dtcDescription: {
    color: '#a0a0a0',
    fontSize: 14,
    flex: 1,
  },
  aiText: {
    color: '#fff',
    fontSize: 14,
    lineHeight: 20,
  },
  hintText: {
    color: '#a0a0a0',
    fontSize: 12,
    lineHeight: 18,
  },
});
