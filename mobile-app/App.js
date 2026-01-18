import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Alert,
  FlatList,
  ActivityIndicator,
  Modal,
  KeyboardAvoidingView,
  Platform,
  SafeAreaView,
  StatusBar,
  PermissionsAndroid,
  AppState
} from 'react-native';
import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Icon from 'react-native-vector-icons/MaterialIcons';
import { Buffer } from 'buffer';
import BleManager from 'react-native-ble-manager';

// Configurare
const API_URL = 'http://192.168.1.146:8000';
const OBD_SERVICE_UUID = 'FFF0';
const OBD_CHARACTERISTIC_UUID = 'FFF1';
const ELM327_SERVICE_UUID = 'E7810A71-73AE-499D-8C15-DAA9EEF37A3F';
const ELM327_CHARACTERISTIC_UUID = 'BEF8D6C9-9C21-4C9E-B632-BD58C1009F9F';

export default function App() {
  // State pentru date mașină
  const [selectedCar, setSelectedCar] = useState('');
  const [carModel, setCarModel] = useState('');
  const [carYear, setCarYear] = useState('');
  const [carMileage, setCarMileage] = useState('');
  const [symptoms, setSymptoms] = useState([]);
  const [currentSymptom, setCurrentSymptom] = useState('');
  
  // State pentru diagnostic
  const [diagnosticResult, setDiagnosticResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState([]);
  
  // State pentru Bluetooth OBD2
  const [devices, setDevices] = useState([]);
  const [scanning, setScanning] = useState(false);
  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [connectedDevice, setConnectedDevice] = useState(null);
  const [obd2Data, setObd2Data] = useState(null);
  const [liveData, setLiveData] = useState({
    rpm: 0,
    speed: 0,
    coolantTemp: 0,
    batteryVoltage: 0,
    engineLoad: 0,
    throttlePosition: 0
  });
  const [dtcCodes, setDtcCodes] = useState([]);
  const [showObd2Modal, setShowObd2Modal] = useState(false);
  
  // Ref-uri
  const bleManagerRef = useRef(null);
  const dataIntervalRef = useRef(null);
  
  // ============================================================================
  // INIȚIALIZARE BLUETOOTH
  // ============================================================================
  
  useEffect(() => {
    // Initializează Bluetooth Manager
    const initBluetooth = async () => {
      try {
        bleManagerRef.current = new BleManager();
        
        // Start BleManager
        await BleManager.start({ showAlert: false });
        console.log('✅ BleManager initialized');
        
        // Ascultă evenimente Bluetooth
        bleManagerRef.current.onStateChange((state) => {
          console.log(`📡 Bluetooth state: ${state}`);
          if (state === 'on') {
            // Bluetooth pornit
          } else if (state === 'off') {
            // Bluetooth oprit
            Alert.alert('Bluetooth oprit', 'Pornește Bluetooth pentru a folosi OBD2');
          }
        }, true);
        
        // Ascultă pentru disconectare
        bleManagerRef.current.onDisconnect((deviceId) => {
          console.log(`❌ Disconnected from ${deviceId}`);
          setConnected(false);
          setConnectedDevice(null);
          clearInterval(dataIntervalRef.current);
          Alert.alert('Deconectat', 'S-a pierdut conexiunea cu dispozitivul OBD2');
        });
        
      } catch (error) {
        console.error('❌ Error initializing Bluetooth:', error);
      }
    };
    
    initBluetooth();
    
    // Cleanup
    return () => {
      if (dataIntervalRef.current) {
        clearInterval(dataIntervalRef.current);
      }
      if (bleManagerRef.current) {
        bleManagerRef.current.stopScan();
        bleManagerRef.current.destroy();
      }
    };
  }, []);
  
  // ============================================================================
  // FUNCȚII BLUETOOTH OBD2
  // ============================================================================
  
  const requestBluetoothPermissions = async () => {
    if (Platform.OS === 'android') {
      try {
        // Android 12+ necesita BLUETOOTH_SCAN si BLUETOOTH_CONNECT
        if (Platform.Version >= 31) {
          const granted = await PermissionsAndroid.requestMultiple([
            PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
            PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
            PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
          ]);
          
          return (
            granted['android.permission.BLUETOOTH_SCAN'] === PermissionsAndroid.RESULTS.GRANTED &&
            granted['android.permission.BLUETOOTH_CONNECT'] === PermissionsAndroid.RESULTS.GRANTED
          );
        } else {
          // Android versiuni mai vechi
          const granted = await PermissionsAndroid.request(
            PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
            {
              title: 'Permisiune Localizare',
              message: 'Aplicația are nevoie de acces la localizare pentru Bluetooth',
              buttonNeutral: 'Întreabă-mă mai târziu',
              buttonNegative: 'Refuză',
              buttonPositive: 'Permite',
            }
          );
          
          return granted === PermissionsAndroid.RESULTS.GRANTED;
        }
      } catch (error) {
        console.error('❌ Permission error:', error);
        return false;
      }
    }
    
    // iOS - se gestionează prin Info.plist
    return true;
  };
  
  const scanForOBD2Devices = async () => {
    try {
      // Cerere permisiuni
      const hasPermission = await requestBluetoothPermissions();
      if (!hasPermission) {
        Alert.alert('Permisiune necesară', 'Aplicația are nevoie de permisiuni Bluetooth');
        return;
      }
      
      setScanning(true);
      setDevices([]);
      
      // Începe scanarea
      await bleManagerRef.current.startScan([], 10, true);
      console.log('🔍 Scanning for OBD2 devices...');
      
      // Ascultă pentru dispozitive găsite
      const subscription = bleManagerRef.current.onDiscover((device) => {
        if (device.name && device.name.includes('OBD')) {
          console.log(`📱 Found device: ${device.name} - ${device.id}`);
          
          setDevices(prev => {
            // Evită duplicate
            const exists = prev.some(d => d.id === device.id);
            if (!exists) {
              return [...prev, {
                id: device.id,
                name: device.name || 'Unknown OBD2',
                rssi: device.rssi,
                advertising: device.advertising
              }];
            }
            return prev;
          });
        }
      });
      
      // Oprește scanarea după 10 secunde
      setTimeout(async () => {
        await bleManagerRef.current.stopScan();
        subscription.remove();
        setScanning(false);
        console.log('✅ Scan complete');
        
        if (devices.length === 0) {
          Alert.alert(
            'Niciun dispozitiv găsit',
            'Asigură-te că:\n1. Bluetooth este pornit\n2. Dispozitivul OBD2 este în mod de pereche\n3. Dispozitivul este în apropiere'
          );
        }
      }, 10000);
      
    } catch (error) {
      console.error('❌ Scan error:', error);
      setScanning(false);
      Alert.alert('Eroare scanare', error.message || 'Nu s-au putut scana dispozitivele');
    }
  };
  
  const connectToOBD2Device = async (device) => {
    try {
      setConnecting(true);
      console.log(`🔗 Connecting to ${device.name}...`);
      
      // Conectează la dispozitiv
      await bleManagerRef.current.connect(device.id);
      console.log('✅ Connected to device');
      
      // Descoperă servicii
      const services = await bleManagerRef.current.retrieveServices(device.id);
      console.log('📡 Services:', services);
      
      // Caută serviciile OBD2
      let targetService = null;
      let targetCharacteristic = null;
      
      // Încearcă diferite UUID-uri pentru OBD2
      const possibleServices = [
        OBD_SERVICE_UUID,
        ELM327_SERVICE_UUID,
        'FFE0',
        '0000ffe0-0000-1000-8000-00805f9b34fb'
      ];
      
      for (const service of services.services) {
        if (possibleServices.includes(service.uuid.toLowerCase())) {
          targetService = service.uuid;
          
          // Caută caracteristica pentru scriere/citire
          const characteristics = services.characteristics[service.uuid] || [];
          for (const char of characteristics) {
            if (char.properties.Write || char.properties.Notify || char.properties.Read) {
              targetCharacteristic = char.uuid;
              break;
            }
          }
          break;
        }
      }
      
      if (!targetService || !targetCharacteristic) {
        throw new Error('Nu s-au găsit servicii OBD2 compatibile');
      }
      
      // Activează notificări
      await bleManagerRef.current.startNotification(
        device.id,
        targetService,
        targetCharacteristic
      );
      
      // Ascultă pentru date primite
      bleManagerRef.current.onNotification((deviceId, data) => {
        console.log('📥 Received OBD2 data:', data);
        processOBD2Data(data);
      });
      
      // Trimite comenzi inițiale ELM327
      await sendOBD2Command('ATZ', device.id, targetService, targetCharacteristic); // Reset
      await new Promise(resolve => setTimeout(resolve, 500));
      await sendOBD2Command('ATI', device.id, targetService, targetCharacteristic); // Identify
      await new Promise(resolve => setTimeout(resolve, 500));
      await sendOBD2Command('ATSP0', device.id, targetService, targetCharacteristic); // Auto protocol
      
      // Setează starea de conectat
      setConnected(true);
      setConnectedDevice(device);
      setConnecting(false);
      
      // Pornește citirea periodică a datelor
      startReadingOBD2Data(device.id, targetService, targetCharacteristic);
      
      Alert.alert('✅ Conectat', `Conectat la ${device.name}`);
      
    } catch (error) {
      console.error('❌ Connection error:', error);
      setConnecting(false);
      Alert.alert('Eroare conectare', error.message || 'Conectarea a eșuat');
      
      // Încearcă deconectarea în caz de eroare
      try {
        await bleManagerRef.current.disconnect(device.id);
      } catch (disconnectError) {
        console.error('Disconnect error:', disconnectError);
      }
    }
  };
  
  const sendOBD2Command = async (command, deviceId, serviceId, characteristicId) => {
    try {
      // Adaugă \r\n (carriage return + new line) pentru ELM327
      const commandWithTerminator = command + '\r\n';
      const buffer = Buffer.from(commandWithTerminator, 'ascii');
      
      await bleManagerRef.current.write(
        deviceId,
        serviceId,
        characteristicId,
        buffer.toJSON().data
      );
      
      console.log(`📤 Sent command: ${command}`);
      
      // Așteaptă răspuns
      await new Promise(resolve => setTimeout(resolve, 200));
      
    } catch (error) {
      console.error(`❌ Error sending command ${command}:`, error);
      throw error;
    }
  };
  
  const startReadingOBD2Data = (deviceId, serviceId, characteristicId) => {
    // Oprește orice interval existent
    if (dataIntervalRef.current) {
      clearInterval(dataIntervalRef.current);
    }
    
    // Pornește citirea periodică
    dataIntervalRef.current = setInterval(async () => {
      if (!connected) return;
      
      try {
        // Trimite comenzi pentru date comune
        const commands = [
          '010C', // RPM
          '010D', // Speed
          '0105', // Coolant temp
          '0142', // Battery voltage
          '0104', // Engine load
          '0111', // Throttle position
          '03'    // DTC codes
        ];
        
        for (const cmd of commands) {
          await sendOBD2Command(cmd, deviceId, serviceId, characteristicId);
          await new Promise(resolve => setTimeout(resolve, 100));
        }
        
      } catch (error) {
        console.error('❌ Error reading OBD2 data:', error);
      }
    }, 3000); // Citește la fiecare 3 secunde
  };
  
  const processOBD2Data = (data) => {
    try {
      // Converteste data primită
      const hexString = Buffer.from(data).toString('hex').toUpperCase();
      console.log(`📊 Raw OBD2 data: ${hexString}`);
      
      // Parsează răspunsurile OBD2
      if (hexString.startsWith('41')) {
        const pid = hexString.substring(2, 4);
        const value = hexString.substring(4);
        
        switch (pid) {
          case '0C': // RPM
            const rpm = (parseInt(value.substring(0, 4), 16) / 4);
            setLiveData(prev => ({ ...prev, rpm: Math.round(rpm) }));
            break;
            
          case '0D': // Speed
            const speed = parseInt(value.substring(0, 2), 16);
            setLiveData(prev => ({ ...prev, speed }));
            break;
            
          case '05': // Coolant temp
            const temp = parseInt(value.substring(0, 2), 16) - 40;
            setLiveData(prev => ({ ...prev, coolantTemp: temp }));
            break;
            
          case '42': // Battery voltage
            const voltage = parseInt(value.substring(0, 4), 16) / 1000;
            setLiveData(prev => ({ ...prev, batteryVoltage: voltage.toFixed(1) }));
            break;
            
          case '04': // Engine load
            const load = (parseInt(value.substring(0, 2), 16) / 2.55);
            setLiveData(prev => ({ ...prev, engineLoad: Math.round(load) }));
            break;
            
          case '11': // Throttle position
            const throttle = (parseInt(value.substring(0, 2), 16) / 2.55);
            setLiveData(prev => ({ ...prev, throttlePosition: Math.round(throttle) }));
            break;
            
          case '43': // DTC response
            const dtcCodes = parseDTCResponse(value);
            setDtcCodes(dtcCodes);
            break;
        }
      }
      
      // Actualizează obd2Data pentru backend
      setObd2Data({
        rpm: liveData.rpm,
        speed: liveData.speed,
        coolant_temp: liveData.coolantTemp,
        battery_voltage: liveData.batteryVoltage,
        engine_load: liveData.engineLoad,
        throttle_position: liveData.throttlePosition,
        timestamp: new Date().toISOString()
      });
      
    } catch (error) {
      console.error('❌ Error processing OBD2 data:', error);
    }
  };
  
  const parseDTCResponse = (hexString) => {
    const dtcCodes = [];
    
    // Format: PXXXX unde X este hex
    // Exemplu: P0300 -> cod misfire
    
    // ELM327 returnează 6 caractere hex per DTC (3 bytes)
    for (let i = 0; i < hexString.length; i += 6) {
      const chunk = hexString.substring(i, i + 6);
      if (chunk.length === 6 && chunk !== '000000') {
        const dtc = convertHexToDTC(chunk);
        if (dtc) dtcCodes.push(dtc);
      }
    }
    
    return dtcCodes;
  };
  
  const convertHexToDTC = (hex) => {
    // Conversie hex la cod DTC
    const firstByte = parseInt(hex.substring(0, 2), 16);
    const secondByte = parseInt(hex.substring(2, 4), 16);
    
    // Determină tipul DTC
    let type = '';
    const firstNibble = (firstByte >> 4) & 0x0F;
    
    switch (firstNibble) {
      case 0: type = 'P0'; break; // Powertrain
      case 1: type = 'P1'; break; // Powertrain
      case 2: type = 'P2'; break; // Powertrain
      case 3: type = 'P3'; break; // Powertrain
      case 4: type = 'C0'; break; // Chassis
      case 5: type = 'C1'; break; // Chassis
      case 6: type = 'B0'; break; // Body
      case 7: type = 'B1'; break; // Body
      case 8: type = 'U0'; break; // Network
      case 9: type = 'U1'; break; // Network
      default: return null;
    }
    
    // Ultimii 3 caractere hex
    const code = (firstByte & 0x0F).toString(16).toUpperCase() + 
                 hex.substring(2, 4).toUpperCase();
    
    return type + code;
  };
  
  const disconnectOBD2 = async () => {
    try {
      if (connectedDevice) {
        await bleManagerRef.current.disconnect(connectedDevice.id);
      }
      
      if (dataIntervalRef.current) {
        clearInterval(dataIntervalRef.current);
        dataIntervalRef.current = null;
      }
      
      setConnected(false);
      setConnectedDevice(null);
      setObd2Data(null);
      setLiveData({
        rpm: 0,
        speed: 0,
        coolantTemp: 0,
        batteryVoltage: 0,
        engineLoad: 0,
        throttlePosition: 0
      });
      setDtcCodes([]);
      
      console.log('✅ Disconnected from OBD2');
      Alert.alert('Deconectat', 'Deconectat de la dispozitivul OBD2');
      
    } catch (error) {
      console.error('❌ Disconnect error:', error);
    }
  };
  
  const clearDTC = async () => {
    try {
      if (connectedDevice) {
        // Trimite comanda de ștergere DTC
        await sendOBD2Command(
          '04',
          connectedDevice.id,
          OBD_SERVICE_UUID,
          OBD_CHARACTERISTIC_UUID
        );
        
        setDtcCodes([]);
        Alert.alert('✅ Succes', 'Codurile DTC au fost șterse');
      }
    } catch (error) {
      console.error('❌ Error clearing DTC:', error);
      Alert.alert('Eroare', 'Nu s-au putut șterge codurile DTC');
    }
  };
  
  // ============================================================================
  // FUNCȚII DIAGNOSTIC
  // ============================================================================
  
  const addSymptom = () => {
    if (currentSymptom.trim()) {
      setSymptoms([...symptoms, currentSymptom.trim()]);
      setCurrentSymptom('');
    }
  };
  
  const removeSymptom = (index) => {
    const newSymptoms = [...symptoms];
    newSymptoms.splice(index, 1);
    setSymptoms(newSymptoms);
  };
  
  const getSimulatedDiagnostic = (data) => {
    // Fallback când backend-ul nu răspunde
    const carType = data.car_type || 'standard';
    return {
      diagnostic: `Diagnostic simulat pentru ${carType}`,
      problems: ['Verificare sistem necesară', 'Diagnostic computerizat recomandat'],
      solutions: ['Service complet', 'Verificare la specialiști'],
      total_price: 450.75,
      ai_confidence: 0.65,
      processing_time: '0.2s',
      ai_engine_used: 'simulation'
    };
  };
  
  const handleDiagnostic = async () => {
    // Validare date de bază
    if (!selectedCar || !carModel) {
      Alert.alert('Date incomplete', 'Completează cel puțin marca și modelul mașinii');
      return;
    }
    
    setLoading(true);
    setDiagnosticResult(null);
    
    try {
      // Pregătește datele
      const diagnosticData = {
        car_type: selectedCar,
        model: carModel,
        year: carYear ? parseInt(carYear) : 2023,
        mileage: carMileage ? parseFloat(carMileage.replace(/[^\d.]/g, '')) : 0,
        simptome: symptoms,
        coduri_dtc: dtcCodes,
        obd2_connected: connected,
        obd2_data: connected ? obd2Data : null,
        timestamp: new Date().toISOString()
      };
      
      console.log('📤 Sending diagnostic data:', diagnosticData);
      
      // Trimite la backend
      const response = await axios.post(
        `${API_URL}/api/v1/diagnostic`,
        diagnosticData,
        {
          headers: { 'Content-Type': 'application/json' },
          timeout: 15000
        }
      );
      
      console.log('✅ Diagnostic response:', response.data);
      setDiagnosticResult(response.data);
      
      // Salvează în istoric
      const historyItem = {
        id: Date.now().toString(),
        car: `${selectedCar} ${carModel}`,
        date: new Date().toLocaleString(),
        price: response.data.total_price,
        problems: response.data.problems.length
      };
      
      setHistory(prev => [historyItem, ...prev.slice(0, 9)]);
      await AsyncStorage.setItem('diagnostic_history', JSON.stringify(history));
      
    } catch (error) {
      console.error('❌ Diagnostic error:', error);
      
      // Fallback la simulare
      const fallbackData = getSimulatedDiagnostic({
        car_type: selectedCar,
        model: carModel
      });
      
      setDiagnosticResult(fallbackData);
      
      Alert.alert(
        'Atenție',
        'Backend-ul nu răspunde. Se afișează diagnostic simulat.',
        [{ text: 'OK' }]
      );
    } finally {
      setLoading(false);
    }
  };
  
  const clearForm = () => {
    setSelectedCar('');
    setCarModel('');
    setCarYear('');
    setCarMileage('');
    setSymptoms([]);
    setCurrentSymptom('');
    setDiagnosticResult(null);
  };
  
  // ============================================================================
  // COMPONENTA OBD2 MODAL
  // ============================================================================
  
  const OBD2Modal = () => (
    <Modal
      animationType="slide"
      transparent={false}
      visible={showObd2Modal}
      onRequestClose={() => setShowObd2Modal(false)}
    >
      <SafeAreaView style={styles.modalContainer}>
        <View style={styles.modalHeader}>
          <Text style={styles.modalTitle}>🔵 Conexiune OBD2 Bluetooth</Text>
          <TouchableOpacity onPress={() => setShowObd2Modal(false)}>
            <Icon name="close" size={24} color="#333" />
          </TouchableOpacity>
        </View>
        
        <ScrollView style={styles.modalContent}>
          {/* Status conexiune */}
          <View style={styles.connectionStatus}>
            <View style={[
              styles.statusIndicator, 
              { backgroundColor: connected ? '#4CAF50' : '#f44336' }
            ]} />
            <Text style={styles.statusText}>
              {connected ? `✅ Conectat la: ${connectedDevice?.name}` : '❌ Deconectat'}
            </Text>
          </View>
          
          {/* Butoane control */}
          <View style={styles.controlButtons}>
            {!connected ? (
              <>
                <TouchableOpacity 
                  style={[styles.controlButton, scanning && styles.buttonDisabled]}
                  onPress={scanForOBD2Devices}
                  disabled={scanning}
                >
                  {scanning ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <>
                      <Icon name="search" size={20} color="#fff" />
                      <Text style={styles.buttonText}>Scanează Dispozitive</Text>
                    </>
                  )}
                </TouchableOpacity>
                
                {devices.length > 0 && (
                  <Text style={styles.devicesFoundText}>
                    🔍 {devices.length} dispozitive găsite
                  </Text>
                )}
              </>
            ) : (
              <TouchableOpacity 
                style={[styles.controlButton, { backgroundColor: '#f44336' }]}
                onPress={disconnectOBD2}
              >
                <Icon name="bluetooth-disabled" size={20} color="#fff" />
                <Text style={styles.buttonText}>Deconectează</Text>
              </TouchableOpacity>
            )}
            
            {connected && (
              <TouchableOpacity 
                style={[styles.controlButton, { backgroundColor: '#FF9800' }]}
                onPress={clearDTC}
              >
                <Icon name="clear-all" size={20} color="#fff" />
                <Text style={styles.buttonText}>Șterge Coduri DTC</Text>
              </TouchableOpacity>
            )}
          </View>
          
          {/* Lista dispozitive */}
          {!connected && devices.length > 0 && (
            <View style={styles.devicesListContainer}>
              <Text style={styles.sectionTitle}>Dispozitive OBD2 Găsite:</Text>
              {devices.map((device) => (
                <TouchableOpacity
                  key={device.id}
                  style={styles.deviceItem}
                  onPress={() => connectToOBD2Device(device)}
                  disabled={connecting}
                >
                  <View style={styles.deviceInfo}>
                    <Icon name="bluetooth" size={24} color="#2196F3" />
                    <View style={styles.deviceDetails}>
                      <Text style={styles.deviceName}>{device.name}</Text>
                      <Text style={styles.deviceId}>{device.id}</Text>
                      <Text style={styles.deviceRssi}>Putere semnal: {device.rssi} dBm</Text>
                    </View>
                  </View>
                  {connecting ? (
                    <ActivityIndicator size="small" color="#2196F3" />
                  ) : (
                    <Icon name="navigate-next" size={24} color="#666" />
                  )}
                </TouchableOpacity>
              ))}
            </View>
          )}
          
          {/* Date live OBD2 */}
          {connected && (
            <View style={styles.liveDataContainer}>
              <Text style={styles.sectionTitle}>📊 Date Live din Mașină:</Text>
              
              <View style={styles.dataGrid}>
                <View style={styles.dataItem}>
                  <Text style={styles.dataLabel}>RPM</Text>
                  <Text style={styles.dataValue}>{liveData.rpm}</Text>
                </View>
                <View style={styles.dataItem}>
                  <Text style={styles.dataLabel}>Viteză</Text>
                  <Text style={styles.dataValue}>{liveData.speed} km/h</Text>
                </View>
                <View style={styles.dataItem}>
                  <Text style={styles.dataLabel}>Temp. Motor</Text>
                  <Text style={styles.dataValue}>{liveData.coolantTemp}°C</Text>
                </View>
                <View style={styles.dataItem}>
                  <Text style={styles.dataLabel}>Baterie</Text>
                  <Text style={styles.dataValue}>{liveData.batteryVoltage}V</Text>
                </View>
                <View style={styles.dataItem}>
                  <Text style={styles.dataLabel}>Încărcare Motor</Text>
                  <Text style={styles.dataValue}>{liveData.engineLoad}%</Text>
                </View>
                <View style={styles.dataItem}>
                  <Text style={styles.dataLabel}>Accelerator</Text>
                  <Text style={styles.dataValue}>{liveData.throttlePosition}%</Text>
                </View>
              </View>
              
              {/* Coduri DTC */}
              {dtcCodes.length > 0 ? (
                <View style={styles.dtcContainer}>
                  <Text style={styles.sectionTitle}>⚠️ Coduri Eroare (DTC):</Text>
                  {dtcCodes.map((code, index) => (
                    <View key={index} style={styles.dtcItem}>
                      <Text style={styles.dtcCode}>{code}</Text>
                      <Text style={styles.dtcDescription}>
                        {getDtcDescription(code)}
                      </Text>
                    </View>
                  ))}
                </View>
              ) : (
                <View style={styles.noDtcContainer}>
                  <Icon name="check-circle" size={24} color="#4CAF50" />
                  <Text style={styles.noDtcText}>✅ Nicio eroare detectată</Text>
                </View>
              )}
            </View>
          )}
          
          {/* Instrucțiuni */}
          <View style={styles.instructionsContainer}>
            <Text style={styles.instructionsTitle}>ℹ️ Instrucțiuni:</Text>
            <Text style={styles.instruction}>1. Pornește Bluetooth pe telefon</Text>
            <Text style={styles.instruction}>2. Conectează adaptorul OBD2 la mașină</Text>
            <Text style={styles.instruction}>3. Apasă "Scanează Dispozitive"</Text>
            <Text style={styles.instruction}>4. Selectează dispozitivul OBD2</Text>
            <Text style={styles.instruction}>5. Datele vor apărea automat</Text>
          </View>
          
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
  
  const getDtcDescription = (code) => {
    // Dicționar simplu pentru coduri DTC comune
    const dtcDescriptions = {
      'P0300': 'Misfire cilindru multiplu',
      'P0171': 'Sistem prea slab (Banca 1)',
      'P0420': 'Eficientă catalizator scăzută',
      'P0128': 'Temperatură termostat sub normal',
      'P0442': 'Mică scurgere sistem evaporativ',
      'P0455': 'Scurgere mare sistem evaporativ',
      'P0401': 'Flux EGR insuficient',
      'P0113': 'Temperatură admisie aer ridicată',
      'P0101': 'Problemă circuit MAF',
      'B0100': 'Senzor impact față',
      'C0032': 'Senzor viteză roată stânga față',
      'U0100': 'Comunicare pierdută cu modul control'
    };
    
    return dtcDescriptions[code] || 'Eroare necunoscută';
  };
  
  // ============================================================================
  // RENDER PRINCIPAL
  // ============================================================================
  
  return (
    <SafeAreaView style={styles.container}>
      <StatusBar backgroundColor="#2196F3" barStyle="light-content" />
      
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>🚗 Auto Diagnostic</Text>
        <View style={styles.headerButtons}>
          <TouchableOpacity 
            style={styles.obd2Button}
            onPress={() => setShowObd2Modal(true)}
          >
            <Icon name="bluetooth" size={20} color="#fff" />
            <Text style={styles.obd2ButtonText}>
              {connected ? 'OBD2 ✅' : 'OBD2'}
            </Text>
          </TouchableOpacity>
          
          <TouchableOpacity 
            style={styles.historyButton}
            onPress={() => {/* Navigare la istoric */}}
          >
            <Icon name="history" size={20} color="#fff" />
          </TouchableOpacity>
        </View>
      </View>
      
      {/* Formular principal */}
      <KeyboardAvoidingView 
        style={styles.keyboardView}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView style={styles.scrollView}>
          {/* Secțiune informații vehicul */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>📋 Informații Vehicul</Text>
            
            <TextInput
              style={styles.input}
              placeholder="Marca mașinii (ex: Dacia, BMW, Tesla)"
              value={selectedCar}
              onChangeText={setSelectedCar}
            />
            
            <TextInput
              style={styles.input}
              placeholder="Model (ex: Logan, X5, Model 3)"
              value={carModel}
              onChangeText={setCarModel}
            />
            
            <View style={styles.rowInputs}>
              <TextInput
                style={[styles.input, styles.halfInput]}
                placeholder="An fabricație"
                value={carYear}
                onChangeText={setCarYear}
                keyboardType="numeric"
                maxLength={4}
              />
              
              <TextInput
                style={[styles.input, styles.halfInput]}
                placeholder="Kilometraj (km)"
                value={carMileage}
                onChangeText={setCarMileage}
                keyboardType="numeric"
              />
            </View>
            
            {/* Indicator OBD2 */}
            {connected && (
              <View style={styles.obd2Indicator}>
                <Icon name="bluetooth-connected" size={16} color="#4CAF50" />
                <Text style={styles.obd2IndicatorText}>
                  OBD2 conectat - {dtcCodes.length} erori detectate
                </Text>
              </View>
            )}
          </View>
          
          {/* Secțiune simptome */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>⚠️ Simptome</Text>
            
            <View style={styles.symptomInputContainer}>
              <TextInput
                style={[styles.input, styles.symptomInput]}
                placeholder="Adaugă simptom (ex: Vibrații, Consum mare)"
                value={currentSymptom}
                onChangeText={setCurrentSymptom}
                onSubmitEditing={addSymptom}
              />
              <TouchableOpacity style={styles.addButton} onPress={addSymptom}>
                <Icon name="add" size={24} color="#fff" />
              </TouchableOpacity>
            </View>
            
            {symptoms.length > 0 && (
              <View style={styles.symptomsList}>
                {symptoms.map((symptom, index) => (
                  <View key={index} style={styles.symptomItem}>
                    <Text style={styles.symptomText}>{symptom}</Text>
                    <TouchableOpacity onPress={() => removeSymptom(index)}>
                      <Icon name="close" size={18} color="#f44336" />
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            )}
          </View>
          
          {/* Butoane acțiune */}
          <View style={styles.actionButtons}>
            <TouchableOpacity 
              style={[styles.button, styles.primaryButton]}
              onPress={handleDiagnostic}
              disabled={loading || !selectedCar || !carModel}
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <>
                  <Icon name="build" size={20} color="#fff" />
                  <Text style={styles.buttonText}>
                    {connected ? '🔧 Diagnostic cu OBD2' : '🛠️ Diagnostic'}
                  </Text>
                </>
              )}
            </TouchableOpacity>
            
            <TouchableOpacity 
              style={[styles.button, styles.secondaryButton]}
              onPress={clearForm}
            >
              <Icon name="delete" size={20} color="#fff" />
              <Text style={styles.buttonText}>Șterge Tot</Text>
            </TouchableOpacity>
          </View>
          
          {/* Rezultat diagnostic */}
          {diagnosticResult && (
            <View style={styles.resultSection}>
              <Text style={styles.resultTitle}>📊 Rezultat Diagnostic</Text>
              
              <View style={styles.resultCard}>
                <Text style={styles.diagnosticText}>
                  {diagnosticResult.diagnostic}
                </Text>
                
                <View style={styles.metricsContainer}>
                  <View style={styles.metricItem}>
                    <Text style={styles.metricLabel}>Preț estimat</Text>
                    <Text style={styles.metricValue}>
                      {diagnosticResult.total_price.toFixed(2)} RON
                    </Text>
                  </View>
                  
                  <View style={styles.metricItem}>
                    <Text style={styles.metricLabel}>Încredere AI</Text>
                    <Text style={styles.metricValue}>
                      {(diagnosticResult.ai_confidence * 100).toFixed(0)}%
                    </Text>
                  </View>
                  
                  <View style={styles.metricItem}>
                    <Text style={styles.metricLabel}>Timp procesare</Text>
                    <Text style={styles.metricValue}>
                      {diagnosticResult.processing_time}
                    </Text>
                  </View>
                </View>
                
                {/* Probleme */}
                <Text style={styles.subsectionTitle}>🔴 Probleme Identificate:</Text>
                {diagnosticResult.problems.map((problem, index) => (
                  <View key={index} style={styles.problemItem}>
                    <Icon name="error-outline" size={16} color="#f44336" />
                    <Text style={styles.problemText}>{problem}</Text>
                  </View>
                ))}
                
                {/* Soluții */}
                <Text style={styles.subsectionTitle}>🟢 Soluții Recomandate:</Text>
                {diagnosticResult.solutions.map((solution, index) => (
                  <View key={index} style={styles.solutionItem}>
                    <Icon name="check-circle" size={16} color="#4CAF50" />
                    <Text style={styles.solutionText}>{solution}</Text>
                  </View>
                ))}
                
                <Text style={styles.engineUsed}>
                  Motor AI: {diagnosticResult.ai_engine_used}
                </Text>
              </View>
            </View>
          )}
          
          {/* Istoric rapid */}
          {history.length > 0 && (
            <View style={styles.historySection}>
              <Text style={styles.sectionTitle}>📅 Istoric Recent</Text>
              {history.slice(0, 3).map((item) => (
                <View key={item.id} style={styles.historyItem}>
                  <Text style={styles.historyCar}>{item.car}</Text>
                  <View style={styles.historyDetails}>
                    <Text style={styles.historyDate}>{item.date}</Text>
                    <Text style={styles.historyPrice}>{item.price} RON</Text>
                  </View>
                </View>
              ))}
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
      
      {/* Modal OBD2 */}
      <OBD2Modal />
    </SafeAreaView>
  );
}

// ============================================================================
// STILURI
// ============================================================================

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  header: {
    backgroundColor: '#2196F3',
    padding: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
  },
  headerTitle: {
    color: '#fff',
    fontSize: 20,
    fontWeight: 'bold',
  },
  headerButtons: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  obd2Button: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    marginRight: 8,
  },
  obd2ButtonText: {
    color: '#fff',
    marginLeft: 4,
    fontWeight: '600',
  },
  historyButton: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    padding: 6,
    borderRadius: 20,
  },
  keyboardView: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
    padding: 16,
  },
  section: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 1.41,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 12,
    color: '#333',
  },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    backgroundColor: '#fafafa',
    marginBottom: 12,
  },
  rowInputs: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  halfInput: {
    width: '48%',
  },
  obd2Indicator: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E8F5E9',
    padding: 8,
    borderRadius: 6,
    marginTop: 8,
  },
  obd2IndicatorText: {
    marginLeft: 8,
    color: '#2E7D32',
    fontSize: 14,
  },
  symptomInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  symptomInput: {
    flex: 1,
    marginBottom: 0,
  },
  addButton: {
    backgroundColor: '#2196F3',
    width: 44,
    height: 44,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 8,
  },
  symptomsList: {
    marginTop: 12,
  },
  symptomItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
    padding: 10,
    borderRadius: 6,
    marginBottom: 6,
  },
  symptomText: {
    flex: 1,
    fontSize: 14,
  },
  actionButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 8,
    flex: 1,
    marginHorizontal: 4,
  },
  primaryButton: {
    backgroundColor: '#2196F3',
  },
  secondaryButton: {
    backgroundColor: '#757575',
  },
  buttonDisabled: {
    backgroundColor: '#BDBDBD',
  },
  buttonText: {
    color: '#fff',
    fontWeight: '600',
    marginLeft: 8,
    fontSize: 16,
  },
  resultSection: {
    marginBottom: 20,
  },
  resultTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 12,
    color: '#333',
  },
  resultCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
  },
  diagnosticText: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 16,
    color: '#2196F3',
    textAlign: 'center',
  },
  metricsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 16,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  metricItem: {
    alignItems: 'center',
  },
  metricLabel: {
    fontSize: 12,
    color: '#666',
    marginBottom: 4,
  },
  metricValue: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
  },
  subsectionTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    marginTop: 12,
    marginBottom: 8,
    color: '#333',
  },
  problemItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 6,
  },
  problemText: {
    flex: 1,
    marginLeft: 8,
    color: '#d32f2f',
    fontSize: 14,
  },
  solutionItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 6,
  },
  solutionText: {
    flex: 1,
    marginLeft: 8,
    color: '#388E3C',
    fontSize: 14,
  },
  engineUsed: {
    fontSize: 12,
    color: '#666',
    textAlign: 'center',
    marginTop: 12,
    fontStyle: 'italic',
  },
  historySection: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
  },
  historyItem: {
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
    paddingVertical: 10,
  },
  historyCar: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
  },
  historyDetails: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  historyDate: {
    fontSize: 12,
    color: '#666',
  },
  historyPrice: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#2196F3',
  },
  
  // Modal OBD2 Styles
  modalContainer: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#2196F3',
    padding: 16,
  },
  modalTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  modalContent: {
    flex: 1,
    padding: 16,
  },
  connectionStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 8,
    marginBottom: 16,
  },
  statusIndicator: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginRight: 12,
  },
  statusText: {
    fontSize: 16,
    fontWeight: '600',
  },
  controlButtons: {
    marginBottom: 20,
  },
  controlButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#2196F3',
    padding: 16,
    borderRadius: 8,
    marginBottom: 12,
  },
  devicesFoundText: {
    textAlign: 'center',
    color: '#2196F3',
    marginBottom: 12,
  },
  devicesListContainer: {
    marginBottom: 20,
  },
  deviceItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 8,
    marginBottom: 8,
    elevation: 1,
  },
  deviceInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  deviceDetails: {
    marginLeft: 12,
    flex: 1,
  },
  deviceName: {
    fontSize: 16,
    fontWeight: '600',
  },
  deviceId: {
    fontSize: 12,
    color: '#666',
    marginTop: 2,
  },
  deviceRssi: {
    fontSize: 12,
    color: '#666',
  },
  liveDataContainer: {
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 16,
    marginBottom: 20,
  },
  dataGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginTop: 12,
  },
  dataItem: {
    width: '48%',
    backgroundColor: '#f5f5f5',
    padding: 12,
    borderRadius: 6,
    marginBottom: 8,
    alignItems: 'center',
  },
  dataLabel: {
    fontSize: 12,
    color: '#666',
    marginBottom: 4,
  },
  dataValue: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#2196F3',
  },
  dtcContainer: {
    backgroundColor: '#FFF3CD',
    borderRadius: 8,
    padding: 16,
    marginTop: 16,
    borderWidth: 1,
    borderColor: '#FFEAA7',
  },
  dtcItem: {
    marginBottom: 8,
  },
  dtcCode: {
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    fontSize: 14,
    fontWeight: 'bold',
    color: '#856404',
  },
  dtcDescription: {
    fontSize: 12,
    color: '#856404',
    marginTop: 2,
  },
  noDtcContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },
  noDtcText: {
    marginLeft: 8,
    color: '#4CAF50',
    fontWeight: '600',
  },
  instructionsContainer: {
    backgroundColor: '#E3F2FD',
    borderRadius: 8,
    padding: 16,
  },
  instructionsTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    marginBottom: 8,
    color: '#1976D2',
  },
  instruction: {
    fontSize: 14,
    color: '#1976D2',
    marginBottom: 4,
  },
});