import React, { useState, useEffect } from 'react';
import { 
  StyleSheet, 
  Text, 
  View, 
  TouchableOpacity, 
  ScrollView,
  ActivityIndicator,
  Alert,
  Platform,
  TextInput,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';

// Services
import obdService from './src/services/obdService';
import nhtsaService from './src/services/nhtsaService';
import partsService from './src/services/partsService';

// Backend URL - update for production
const BACKEND_URL = __DEV__ 
  ? 'http://localhost:3000' 
  : 'https://your-production-url.com';

export default function App() {
  const [isScanning, setIsScanning] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [deviceName, setDeviceName] = useState('');
  const [vehicleInfo, setVehicleInfo] = useState(null);
  const [dtcs, setDtcs] = useState([]);
  const [aiInterpretation, setAiInterpretation] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [manualVIN, setManualVIN] = useState('');
  const [partsLinks, setPartsLinks] = useState([]);

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
      if (error.message.includes('permission')) {
        Alert.alert('Permission Required', 'Please grant Bluetooth permissions to scan for OBD devices.');
      } else {
        Alert.alert('Scan Error', error.message);
      }
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
      let currentVehicleInfo = null;
      
      if (vin && vin.length === 17) {
        // Decode VIN with NHTSA
        const vinData = await nhtsaService.decodeVINValues(vin);
        if (vinData.success) {
          currentVehicleInfo = vinData.data;
          setVehicleInfo(currentVehicleInfo);
        }
      }

      // Get DTCs
      const codes = await obdService.getDTCs();
      setDtcs(codes);

      // Get AI interpretation via backend
      if (codes.length > 0) {
        await getAIInterpretation(codes, currentVehicleInfo);
        
        // Get parts links for first DTC
        const links = partsService.getCommonPartsForDTC(codes[0].code, currentVehicleInfo);
        setPartsLinks(links);
      }
    } catch (error) {
      console.error('Error reading vehicle data:', error);
      Alert.alert('Read Error', 'Failed to read vehicle data. Please try again.');
    }
  };

  const getAIInterpretation = async (codes, vInfo) => {
    try {
      const response = await fetch(`${BACKEND_URL}/api/interpret-dtcs`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          dtcs: codes,
          vehicleInfo: vInfo ? {
            year: vInfo.ModelYear,
            make: vInfo.Make,
            model: vInfo.Model,
          } : null,
        }),
      });

      const data = await response.json();
      if (data.success) {
        setAiInterpretation(data.interpretation);
      } else {
        setAiInterpretation('Unable to get AI interpretation. Please try again.');
      }
    } catch (error) {
      console.error('AI interpretation error:', error);
      setAiInterpretation('Backend unavailable. Please check your connection.');
    }
  };

  const lookupManualVIN = async () => {
    if (manualVIN.length !== 17) {
      Alert.alert('Invalid VIN', 'VIN must be exactly 17 characters.');
      return;
    }

    setIsLoading(true);
    try {
      const vinData = await nhtsaService.decodeVINValues(manualVIN);
      if (vinData.success) {
        setVehicleInfo(vinData.data);
        Alert.alert('Success', `Found: ${vinData.data.ModelYear} ${vinData.data.Make} ${vinData.data.Model}`);
      } else {
        Alert.alert('Error', 'Could not decode VIN. Please check and try again.');
      }
    } catch (error) {
      Alert.alert('Error', error.message);
    } finally {
      setIsLoading(false);
    }
  };

  const disconnect = async () => {
    await obdService.disconnect();
    setIsConnected(false);
    setDeviceName('');
    setVehicleInfo(null);
    setDtcs([]);
    setAiInterpretation('');
    setPartsLinks([]);
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
                <Text style={styles.dtcDescription}>{dtc.description || 'Tap for details'}</Text>
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

        {/* Parts Links */}
        {partsLinks.length > 0 && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Parts You May Need</Text>
            {partsLinks.map((part, index) => (
              <View key={index} style={styles.partRow}>
                <Text style={styles.partName}>{part.name}</Text>
              </View>
            ))}
          </View>
        )}

        {/* Manual VIN Entry (fallback) */}
        {!isConnected && !vehicleInfo && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Manual VIN Entry</Text>
            <Text style={styles.hintText}>
              Don't have an OBD device? Enter your VIN manually.
            </Text>
            <TextInput
              style={styles.vinInput}
              placeholder="Enter 17-character VIN"
              placeholderTextColor="#666"
              value={manualVIN}
              onChangeText={setManualVIN}
              maxLength={17}
              autoCapitalize="characters"
            />
            <TouchableOpacity 
              style={[styles.button, { marginTop: 10 }]} 
              onPress={lookupManualVIN}
              disabled={isLoading}
            >
              {isLoading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.buttonText}>Lookup VIN</Text>
              )}
            </TouchableOpacity>
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
    marginBottom: 10,
  },
  vinInput: {
    backgroundColor: '#1a1a2e',
    borderRadius: 8,
    padding: 12,
    color: '#fff',
    fontSize: 16,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  partRow: {
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#1a1a2e',
  },
  partName: {
    color: '#fff',
    fontSize: 14,
  },
});
