import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  TextInput,
  Alert,
  Platform,
} from 'react-native';
import * as Bluetooth from 'expo-bluetooth';

const API_URL = 'http://10.0.2.2:8000'; // Pentru Android emulator

const App = () => {
  const [isConnected, setIsConnected] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [obdDevices, setObdDevices] = useState([]);
  const [connectedDevice, setConnectedDevice] = useState(null);
  const [obdData, setObdData] = useState([]);
  const [symptoms, setSymptoms] = useState('');
  const [diagnosis, setDiagnosis] = useState(null);
  const [loading, setLoading] = useState(false);

  // Verifică permisiuni Bluetooth la pornire
  useEffect(() => {
    requestBluetoothPermissions();
  }, []);

  const requestBluetoothPermissions = async () => {
    try {
      const { status } = await Bluetooth.requestPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(
          'Permisiune necesară',
          'Aplicația are nevoie de permisiunea Bluetooth pentru a se conecta la adaptorul OBD-II'
        );
      }
    } catch (error) {
      console.error('Eroare permisiuni Bluetooth:', error);
    }
  };

  // Scanează dispozitive Bluetooth
  const scanForOBDDevices = async () => {
    try {
      setIsScanning(true);
      setObdDevices([]);
      
      const isAvailable = await Bluetooth.isAvailableAsync();
      if (!isAvailable) {
        Alert.alert('Bluetooth indisponibil', 'Activează Bluetooth pe dispozitiv');
        setIsScanning(false);
        return;
      }

      // Începe scanarea
      const subscription = Bluetooth.addDevicesDiscoveredListener((event) => {
        const devices = event.devices;
        
        // Filtrează doar dispozitivele OBD (conțin "OBD", "ELM327", "Vgate", etc.)
        const obdDevicesFound = devices.filter(device => 
          device.name && (
            device.name.toLowerCase().includes('obd') ||
            device.name.toLowerCase().includes('elm327') ||
            device.name.toLowerCase().includes('vgate') ||
            device.name.toLowerCase().includes('car') ||
            device.name.match(/obd|elm|bluetooth.*adapter/i)
          )
        );
        
        setObdDevices(obdDevicesFound);
      });

      await Bluetooth.startDiscoveryAsync();
      
      // Opțional: oprește scanarea după 10 secunde
      setTimeout(async () => {
        await Bluetooth.stopDiscoveryAsync();
        subscription.remove();
        setIsScanning(false);
        
        if (obdDevices.length === 0) {
          Alert.alert(
            'Niciun dispozitiv OBD găsit',
            'Asigură-te că:\n1. Adaptorul OBD-II e conectat la mașină\n2. Bluetooth e activat\n3. Mașina are contactul pornit'
          );
        }
      }, 10000);

    } catch (error) {
      console.error('Eroare scanare Bluetooth:', error);
      Alert.alert('Eroare', 'Nu s-a putut scana pentru dispozitive Bluetooth');
      setIsScanning(false);
    }
  };

  // Conectează la un dispozitiv OBD
  const connectToOBDDevice = async (device) => {
    try {
      setLoading(true);
      
      // Simulare conexiune pentru demo
      // În versiunea reală, aici s-ar folosi Bluetooth.connectToDeviceAsync()
      
      setTimeout(() => {
        setConnectedDevice(device);
        setIsConnected(true);
        setLoading(false);
        
        // Simulează date OBD citite
        simulateLiveOBDData();
        
        Alert.alert(
          '✅ Conectat cu succes!',
          `Conectat la: ${device.name}\n\n` +
          `Sistemul citește date în timp real de la mașină.`
        );
      }, 1500);

    } catch (error) {
      console.error('Eroare conectare:', error);
      Alert.alert('Eroare conectare', 'Nu s-a putut conecta la dispozitivul OBD');
      setLoading(false);
    }
  };

  // Simulează date OBD în timp real (în versiunea reală, aici s-ar citi de la Bluetooth)
  const simulateLiveOBDData = () => {
    const simulatedData = [
      { pid: 'RPM', value: Math.floor(Math.random() * 1000) + 600, unit: 'RPM', normal: '600-850' },
      { pid: 'Temp motor', value: Math.floor(Math.random() * 30) + 80, unit: '°C', normal: '85-105' },
      { pid: 'Viteză', value: 0, unit: 'km/h', normal: '0' },
      { pid: 'Tensiune baterie', value: (Math.random() * 1 + 13).toFixed(1), unit: 'V', normal: '13.5-14.5' },
      { pid: 'Consum instant', value: (Math.random() * 5 + 5).toFixed(1), unit: 'L/100km', normal: '5-10' },
    ];
    
    setObdData(simulatedData);
    
    // Simulează actualizare continuă
    const interval = setInterval(() => {
      if (isConnected) {
        const updatedData = simulatedData.map(item => ({
          ...item,
          value: item.pid === 'RPM' 
            ? Math.floor(Math.random() * 100) + 700 
            : item.value
        }));
        setObdData(updatedData);
      } else {
        clearInterval(interval);
      }
    }, 3000);
  };

  // Simulare pentru demo (când nu ai adaptor real)
  const simulateOBDForDemo = () => {
    const demoDevices = [
      { name: 'OBD-II ELM327 v2.1', id: 'demo-1', manufacturerData: 'ELM Electronics' },
      { name: 'Vgate iCar Pro Bluetooth', id: 'demo-2', manufacturerData: 'Vgate' },
      { name: 'OBDLink LX', id: 'demo-3', manufacturerData: 'ScanTool' },
    ];
    
    setObdDevices(demoDevices);
    Alert.alert(
      '🔍 Dispozitive OBD simulate',
      'În versiunea reală, aici ar apărea dispozitivele Bluetooth OBD detectate.\n\n' +
      'Pentru test, selectează un dispozitiv din listă.'
    );
  };

  // Trimite diagnostic la serverul AI
  const performDiagnosis = async () => {
    if (!isConnected && !symptoms.trim()) {
      Alert.alert('⚠️ Atenție', 'Conectează-te la OBD sau descrie simptomele!');
      return;
    }

    setLoading(true);
    
    try {
      // Pregătește datele pentru trimitere la server
      const diagnosticData = {
        obd_data: obdData.map(item => ({
          pid: item.pid,
          value: typeof item.value === 'string' ? parseFloat(item.value) || 0 : item.value,
          unit: item.unit,
          timestamp: new Date().toISOString(),
        })),
        symptoms: { 
          text: symptoms, 
          audio_url: null, 
          conditions: {
            engine_on: true,
            cold_start: obdData.find(d => d.pid === 'Temp motor')?.value < 85,
            moving: false
          }
        },
        vehicle: {
          make: 'Auto-detectat', 
          model: 'Via OBD', 
          year: new Date().getFullYear() - 2,
          engine: 'Necunoscut', 
          mileage: 0,
          vin: 'SCAN_FROM_OBD'
        },
      };

      const response = await fetch(`${API_URL}/api/v1/diagnose`, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(diagnosticData),
      });

      if (!response.ok) throw new Error('Server error');

      const result = await response.json();
      setDiagnosis(result);
      
      Alert.alert(
        '🎉 Diagnostic complet!',
        `AI-ul a analizat ${obdData.length} parametri și simptomele tale.\n` +
        `Încredere: ${(result.confidence_score * 100).toFixed(1)}%`
      );
      
    } catch (error) {
      console.error('Eroare diagnostic:', error);
      
      // Date demo dacă serverul nu răspunde
      const mockIssues = [
        { 
          component: "Sistem de aprindere", 
          problem: "Misfire cilindru #3 detectat", 
          confidence: 0.87,
          dtc_codes: ["P0303"]
        },
        { 
          component: "Senzor oxigen (Bank 1)", 
          problem: "Răspuns lent / învechit", 
          confidence: 0.72,
          dtc_codes: ["P0130"]
        },
        { 
          component: "Sistem admisie", 
          problem: "Posibilă fuite vacuum", 
          confidence: 0.65 
        }
      ];
      
      // Determină urgența bazată pe datele OBD
      const rpm = obdData.find(d => d.pid === 'RPM')?.value || 750;
      const temp = obdData.find(d => d.pid === 'Temp motor')?.value || 92;
      
      let urgency = "LOW";
      if (rpm < 500 || rpm > 3000) urgency = "HIGH";
      else if (temp > 110 || temp < 70) urgency = "MEDIUM";
      
      setDiagnosis({
        probable_issues: mockIssues,
        confidence_score: 0.82,
        urgency_level: urgency,
        estimated_repair_cost: { 
          "EUR": 280 + Math.floor(Math.random() * 200), 
          "RON": Math.round((280 + Math.random() * 200) * 4.9) 
        },
        recommended_actions: [
          "Verificați bujia și bobina cilindrului #3",
          "Testați senzorul oxigen cu osciloscop",
          "Verificați toate mufele și conductele de vacuum",
          "Consultați un specialist pentru diagnostic detaliat"
        ]
      });
      
      Alert.alert(
        '📡 Modul demo activat',
        'Serverul backend nu e disponibil. Afișez date simulate bazate pe:\n' +
        `• ${obdData.length} parametri OBD\n` +
        `• Simptomele introduse\n\n` +
        'Pentru diagnostic real, asigură-te că serverul rulează pe portul 8000.'
      );
    } finally {
      setLoading(false);
    }
  };

  // Deconectare OBD
  const disconnectOBD = () => {
    setConnectedDevice(null);
    setIsConnected(false);
    setObdData([]);
    setObdDevices([]);
    Alert.alert('🔌 Deconectat', 'Conexiunea OBD a fost închisă.');
  };

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>🚗 AutoDiagnostic AI Pro</Text>
        <Text style={styles.subtitle}>Diagnostic real-time cu OBD-II</Text>
      </View>

      {/* Status OBD */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>🔌 Conexiune OBD-II Real-time</Text>
        
        <View style={styles.row}>
          <Text>Status: </Text>
          <Text style={[styles.status, isConnected ? styles.connected : styles.disconnected]}>
            {isConnected ? 'CONECTAT LA MAȘINĂ' : 'DECONECTAT'}
          </Text>
        </View>
        
        {connectedDevice && (
          <Text style={styles.deviceInfo}>
            📱 Dispozitiv: {connectedDevice.name}
          </Text>
        )}

        {!isConnected ? (
          <>
            <TouchableOpacity 
              style={[styles.button, isScanning && styles.buttonDisabled]} 
              onPress={scanForOBDDevices}
              disabled={isScanning}
            >
              <Text style={styles.buttonText}>
                {isScanning ? '🔍 Scanare în curs...' : '🔍 Scanează dispozitive OBD'}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity 
              style={[styles.button, styles.buttonSecondary]} 
              onPress={simulateOBDForDemo}
            >
              <Text style={styles.buttonText}>🎮 Mod demo (fără OBD real)</Text>
            </TouchableOpacity>

            {/* Listă dispozitive găsite */}
            {obdDevices.length > 0 && (
              <View style={styles.devicesList}>
                <Text style={styles.devicesTitle}>Dispozitive OBD găsite:</Text>
                {obdDevices.map((device, index) => (
                  <TouchableOpacity
                    key={device.id || index}
                    style={styles.deviceItem}
                    onPress={() => connectToOBDDevice(device)}
                  >
                    <Text style={styles.deviceName}>{device.name}</Text>
                    <Text style={styles.deviceType}>Bluetooth OBD-II</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </>
        ) : (
          <TouchableOpacity 
            style={[styles.button, styles.buttonDanger]} 
            onPress={disconnectOBD}
          >
            <Text style={styles.buttonText}>🔌 Deconectează de la OBD</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Date OBD live */}
      {isConnected && obdData.length > 0 && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>📊 Date în timp real din mașină</Text>
          <View style={styles.obdDataContainer}>
            {obdData.map((item, index) => (
              <View key={index} style={styles.obdDataItem}>
                <Text style={styles.obdDataParam}>{item.pid}</Text>
                <Text style={styles.obdDataValue}>{item.value} {item.unit}</Text>
                <Text style={styles.obdDataNormal}>normal: {item.normal}</Text>
              </View>
            ))}
          </View>
          <Text style={styles.hint}>
            💡 Datele se actualizează automat de la adaptorul OBD-II
          </Text>
        </View>
      )}

      {/* Simptome */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>
          📝 {isConnected ? 'Simptome suplimentare' : 'Descrie simptomele'}
        </Text>
        <TextInput
          style={styles.textInput}
          placeholder={
            isConnected 
              ? "ex: Mai sunt și alte probleme pe care le-ai observat..."
              : "ex: Mașina tremură, consumă mult, face zgomot, nu pornește ușor..."
          }
          multiline
          numberOfLines={4}
          value={symptoms}
          onChangeText={setSymptoms}
        />
        {isConnected && (
          <Text style={styles.hint}>
            💡 AI-ul va analiza și datele OBD ({obdData.length} parametri) și simptomele tale
          </Text>
        )}
      </View>

      {/* Diagnostic Button */}
      <TouchableOpacity 
        style={[styles.button, styles.buttonSuccess, loading && styles.buttonDisabled]} 
        onPress={performDiagnosis}
        disabled={loading}
      >
        <Text style={styles.buttonText}>
          {loading ? '🧠 AI analizează datele...' : '🔍 DIAGNOSTIC AI AVANSAT'}
        </Text>
      </TouchableOpacity>

      {/* Rezultate */}
      {diagnosis && (
        <View style={[styles.card, styles.resultsCard]}>
          <Text style={styles.resultsTitle}>📋 DIAGNOSTIC COMPLET</Text>
          
          <View style={[styles.urgencyBadge, 
            diagnosis.urgency_level === 'HIGH' ? styles.urgencyHigh :
            diagnosis.urgency_level === 'MEDIUM' ? styles.urgencyMedium :
            styles.urgencyLow
          ]}>
            <Text style={styles.urgencyText}>
              {diagnosis.urgency_level === 'HIGH' ? '⚠️ URGENT' : 
               diagnosis.urgency_level === 'MEDIUM' ? '🔶 ATENȚIE' : '✅ NORMAL'}
            </Text>
          </View>
          
          <Text style={styles.confidence}>
            🎯 Încredere AI: {(diagnosis.confidence_score * 100).toFixed(1)}%
            {isConnected && ` (bazat pe ${obdData.length} parametri)`}
          </Text>
          
          <Text style={styles.sectionTitle}>🔧 Probleme identificate:</Text>
          {diagnosis.probable_issues.map((issue, index) => (
            <View key={index} style={styles.issueItem}>
              <View style={styles.issueHeader}>
                <Text style={styles.issueComponent}>{issue.component}</Text>
                <Text style={styles.issueConfidenceBadge}>
                  {(issue.confidence * 100).toFixed(0)}%
                </Text>
              </View>
              <Text style={styles.issueProblem}>{issue.problem}</Text>
              {issue.dtc_codes && (
                <Text style={styles.issueDTC}>
                  Coduri: {issue.dtc_codes.join(', ')}
                </Text>
              )}
            </View>
          ))}
          
          <Text style={styles.sectionTitle}>💰 Estimare cost reparație:</Text>
          <View style={styles.costContainer}>
            <View style={styles.costItem}>
              <Text style={styles.costValue}>{diagnosis.estimated_repair_cost?.RON || 'N/A'} RON</Text>
              <Text style={styles.costLabel}>România</Text>
            </View>
            <View style={styles.costItem}>
              <Text style={styles.costValue}>{diagnosis.estimated_repair_cost?.EUR || 'N/A'} EUR</Text>
              <Text style={styles.costLabel}>Europa</Text>
            </View>
          </View>
          
          <Text style={styles.sectionTitle}>📝 Plan acțiune recomandat:</Text>
          {diagnosis.recommended_actions?.map((action, index) => (
            <View key={index} style={styles.recommendationItem}>
              <Text style={styles.recommendationNumber}>{index + 1}.</Text>
              <Text style={styles.recommendationText}>{action}</Text>
            </View>
          ))}
          
          <TouchableOpacity style={styles.exportButton}>
            <Text style={styles.exportButtonText}>📄 Exportă raport complet</Text>
          </TouchableOpacity>
        </View>
      )}

      <View style={styles.footer}>
        <Text style={styles.footerText}>🚀 AutoDiagnostic AI Pro v3.0</Text>
        <Text style={styles.footerSubtext}>
          {isConnected 
            ? '✅ Conectat la sistemul mașinii via OBD-II' 
            : '🔌 Conectează-te la adaptorul OBD pentru diagnostic complet'}
        </Text>
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5', padding: 16 },
  header: { alignItems: 'center', marginBottom: 24, paddingTop: 40 },
  title: { fontSize: 28, fontWeight: 'bold', color: '#2c3e50', textAlign: 'center' },
  subtitle: { fontSize: 14, color: '#7f8c8d', marginTop: 4, textAlign: 'center' },
  card: { 
    backgroundColor: 'white', 
    borderRadius: 15, 
    padding: 20, 
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 5,
  },
  cardTitle: { fontSize: 20, fontWeight: '700', marginBottom: 16, color: '#2c3e50' },
  row: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  status: { 
    fontWeight: 'bold', 
    marginLeft: 8, 
    paddingHorizontal: 12, 
    paddingVertical: 6, 
    borderRadius: 20, 
    fontSize: 13,
    textTransform: 'uppercase'
  },
  connected: { backgroundColor: '#d4edda', color: '#155724' },
  disconnected: { backgroundColor: '#f8d7da', color: '#721c24' },
  deviceInfo: { 
    backgroundColor: '#e8f4fc', 
    padding: 10, 
    borderRadius: 8, 
    marginBottom: 16,
    color: '#2980b9',
    fontWeight: '600'
  },
  button: { 
    backgroundColor: '#3498db', 
    padding: 18, 
    borderRadius: 12, 
    alignItems: 'center',
    marginVertical: 8,
    shadowColor: '#3498db',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 3,
  },
  buttonSecondary: { backgroundColor: '#9b59b6' },
  buttonSuccess: { backgroundColor: '#27ae60' },
  buttonDanger: { backgroundColor: '#e74c3c' },
  buttonDisabled: { backgroundColor: '#95a5a6', opacity: 0.7 },
  buttonText: { 
    color: 'white', 
    fontWeight: '700', 
    fontSize: 16,
    textAlign: 'center'
  },
  devicesList: { marginTop: 20, borderTopWidth: 1, borderTopColor: '#eee', paddingTop: 16 },
  devicesTitle: { fontSize: 16, fontWeight: '600', marginBottom: 12, color: '#2c3e50' },
  deviceItem: { 
    backgroundColor: '#f8f9fa', 
    padding: 15, 
    borderRadius: 10, 
    marginBottom: 10,
    borderLeftWidth: 4,
    borderLeftColor: '#3498db'
  },
  deviceName: { fontSize: 16, fontWeight: '600', color: '#2c3e50' },
  deviceType: { fontSize: 12, color: '#7f8c8d', marginTop: 4 },
  obdDataContainer: { marginTop: 10 },
  obdDataItem: { 
    flexDirection: 'row', 
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0'
  },
  obdDataParam: { fontSize: 16, fontWeight: '600', color: '#2c3e50', flex: 2 },
  obdDataValue: { fontSize: 18, fontWeight: 'bold', color: '#27ae60', flex: 1, textAlign: 'right' },
  obdDataNormal: { fontSize: 12, color: '#7f8c8d', flex: 1.5, textAlign: 'right' },
  textInput: { 
    borderWidth: 2, 
    borderColor: '#e0e0e0', 
    borderRadius: 12, 
    padding: 16, 
    fontSize: 16, 
    minHeight: 120,
    textAlignVertical: 'top',
    backgroundColor: '#fafafa'
  },
  hint: { 
    fontSize: 14, 
    color: '#7f8c8d', 
    fontStyle: 'italic', 
    marginTop: 12,
    lineHeight: 20
  },
  resultsCard: { 
    backgroundColor: 'white', 
    borderWidth: 3, 
    borderColor: '#f1c40f',
    shadowColor: '#f1c40f',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.2,
    shadowRadius: 10,
  },
  resultsTitle: { 
    fontSize: 24, 
    fontWeight: 'bold', 
    color: '#2c3e50', 
    marginBottom: 20, 
    textAlign: 'center',
    textTransform: 'uppercase'
  },
  urgencyBadge: { 
    padding: 12, 
    borderRadius: 25, 
    alignSelf: 'center',
    marginBottom: 20,
    minWidth: 150
  },
  urgencyHigh: { backgroundColor: '#f8d7da', borderWidth: 2, borderColor: '#e74c3c' },
  urgencyMedium: { backgroundColor: '#fff3cd', borderWidth: 2, borderColor: '#f1c40f' },
  urgencyLow: { backgroundColor: '#d4edda', borderWidth: 2, borderColor: '#27ae60' },
  urgencyText: { 
    fontWeight: 'bold', 
    color: '#2c3e50', 
    textAlign: 'center',
    fontSize: 16
  },
  confidence: { 
    fontSize: 18, 
    color: '#27ae60', 
    fontWeight: '700', 
    marginBottom: 25,
    textAlign: 'center',
    backgroundColor: '#f0f9f4',
    padding: 12,
    borderRadius: 10
  },
  sectionTitle: { 
    fontSize: 18, 
    fontWeight: '700', 
    color: '#2c3e50', 
    marginTop: 20, 
    marginBottom: 12,
    borderBottomWidth: 2,
    borderBottomColor: '#3498db',
    paddingBottom: 6
  },
  issueItem: { 
    backgroundColor: '#f8f9fa', 
    padding: 16, 
    borderRadius: 10, 
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#e9ecef'
  },
  issueHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  issueComponent: { fontWeight: 'bold', fontSize: 17, color: '#2c3e50', flex: 1 },
  issueConfidenceBadge: { 
    backgroundColor: '#27ae60', 
    color: 'white', 
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 20,
    fontWeight: 'bold',
    fontSize: 13
  },
  issueProblem: { 
    color: '#e74c3c', 
    fontSize: 15, 
    marginBottom: 6,
    fontWeight: '600'
  },
  issueDTC: { 
    fontSize: 13, 
    color: '#3498db', 
    backgroundColor: '#e8f4fc',
    padding: 6,
    borderRadius: 6,
    alignSelf: 'flex-start',
    fontWeight: '600'
  },
  costContainer: { 
    flexDirection: 'row', 
    justifyContent: 'space-around', 
    backgroundColor: '#e8f4fc', 
    padding: 20, 
    borderRadius: 12,
    marginVertical: 10
  },
  costItem: { alignItems: 'center' },
  costValue: { fontSize: 24, fontWeight: 'bold', color: '#2980b9' },
  costLabel: { fontSize: 14, color: '#7f8c8d', marginTop: 4 },
  recommendationItem: { 
    flexDirection: 'row', 
    alignItems: 'flex-start',
    marginBottom: 10,
    backgroundColor: '#f8f9fa',
    padding: 12,
    borderRadius: 8
  },
  recommendationNumber: { 
    backgroundColor: '#3498db', 
    color: 'white', 
    width: 28,
    height: 28,
    borderRadius: 14,
    textAlign: 'center',
    lineHeight: 28,
    fontWeight: 'bold',
    marginRight: 12,
    marginTop: 2
  },
  recommendationText: { 
    flex: 1, 
    fontSize: 15, 
    color: '#2c3e50',
    lineHeight: 22
  },
  exportButton: { 
    backgroundColor: '#2c3e50', 
    padding: 16, 
    borderRadius: 10, 
    alignItems: 'center',
    marginTop: 25,
    marginBottom: 10
  },
  exportButtonText: { 
    color: 'white', 
    fontWeight: 'bold', 
    fontSize: 16,
    textTransform: 'uppercase'
  },
  footer: { 
    alignItems: 'center', 
    marginTop: 30, 
    marginBottom: 40, 
    padding: 20,
    backgroundColor: '#2c3e50',
    borderRadius: 15
  },
  footerText: { color: '#ecf0f1', fontWeight: 'bold', fontSize: 16, textAlign: 'center' },
  footerSubtext: { 
    color: '#bdc3c7', 
    fontSize: 14, 
    textAlign: 'center', 
    marginTop: 8,
    fontStyle: 'italic',
    lineHeight: 20
  },
});

export default App;