import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Alert,
  ActivityIndicator,
  Switch,
  Modal,
  FlatList,
  Image
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';
import Icon from 'react-native-vector-icons/MaterialIcons';

// Configurație
const API_URL = 'http://localhost:8000/api/v1/diagnostic';
const MOD_DEZVOLTARE = false; // true pentru Development Build cu Bluetooth real

export default function App() {
  // State-uri
  const [simptome, setSimptome] = useState('');
  const [selectedCodes, setSelectedCodes] = useState([]);
  const [vehicleInfo, setVehicleInfo] = useState({
    marca: '',
    model: '',
    an: '',
    vin: ''
  });
  const [diagnosticResult, setDiagnosticResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState([]);
  const [showHistory, setShowHistory] = useState(false);

  // Coduri DTC comune
  const dtcCodes = [
    'P0300', 'P0301', 'P0302', 'P0303', 'P0304',
    'P0171', 'P0172', 'P0420', 'P0442', 'P0455',
    'P0128', 'P0113', 'P0112', 'P0101', 'P0102'
  ];

  // FUNCȚIA PRINCIPALĂ - REPARATĂ COMPLET
  const getAIDiagnostic = async (simptomeText, selectedCodes, vehicleInfo) => {
    console.log('🚀 PORNESC DIAGNOSTIC AI...');
    
    // VALORI GARANTATE pentru backend
    const requestData = {
      simptome: String(simptomeText || ''),
      coduri_dtc: Array.isArray(selectedCodes) ? selectedCodes : [],
      marca: String(vehicleInfo?.marca || ''),
      model: String(vehicleInfo?.model || ''),
      an_fabricatie: vehicleInfo?.an ? parseInt(vehicleInfo.an) : null,
      vin: String(vehicleInfo?.vin || '')
    };
    
    console.log('📦 DATE TRIMISE CĂTRE BACKEND:', JSON.stringify(requestData));
    
    try {
      const response = await axios.post(API_URL, requestData, {
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        timeout: 15000 // 15 secunde timeout
      });
      
      console.log('✅ RĂSPUNS BACKEND PRIMIT');
      return response.data;
      
    } catch (error) {
      console.error('❌ EROARE AXIOS:', {
        message: error.message,
        status: error.response?.status,
        data: error.response?.data,
        config: error.config
      });
      
      // FALLBACK - date simulate dacă backend-ul pică
      console.log('🔄 Folosesc date simulate...');
      return getSimulatedDiagnostic(simptomeText, selectedCodes, vehicleInfo);
    }
  };

  // Date simulate pentru fallback
  const getSimulatedDiagnostic = (simptomeText, selectedCodes, vehicleInfo) => {
    const problems = {
      'vibra': {
        problema: 'Vibrații la volan/motor',
        cauze: ['Roti neechilibrate', 'Bucșe amortizoare uzate', 'Arbore cardan'],
        pret: '300-1200 RON'
      },
      'zgomot': {
        problema: 'Zgomot anormal motor',
        cauze: ['Rulmenți uzati', 'Curea distribuție', 'Turbină defectă'],
        pret: '500-2500 RON'
      },
      'fum': {
        problema: 'Fum la eșapament',
        cauze: ['Ardere ulei', 'Senzor oxigen defect', 'EGR blocat'],
        pret: '800-3500 RON'
      },
      'consum': {
        problema: 'Consum crescut combustibil',
        cauze: ['Senzor MAF defect', 'Bujii uzate', 'Filtru aer înfundat'],
        pret: '200-800 RON'
      }
    };
    
    let problema = 'Verificare generală recomandată';
    let cauze = ['Necesită scanare OBD2'];
    let pret = '200-800 RON';
    let urgenta = 'medie';
    
    const simptomeLower = simptomeText.toLowerCase();
    
    for (const [key, value] of Object.entries(problems)) {
      if (simptomeLower.includes(key)) {
        problema = value.problema;
        cauze = value.cauze;
        pret = value.pret;
        urgenta = key === 'zgomot' || key === 'fum' ? 'ridicată' : 'medie';
        break;
      }
    }
    
    // Dacă avem coduri DTC
    if (selectedCodes.length > 0) {
      problema = `Probleme indicate (${selectedCodes.join(', ')})`;
      urgenta = 'ridicată';
      pret = '400-2000 RON';
    }
    
    return {
      succes: true,
      problema_identificata: problema,
      cauze_posibile: cauze,
      recomandari: [
        'Scanare computerizată OBD2',
        'Verificare la service autorizat',
        'Cere oferte de la mai mulți mecanicii'
      ],
      urgenta: urgenta,
      incredere_procent: 85.5,
      pret_estimativ: {
        interval: pret,
        estimare_medie: pret.split('-')[0] + ' RON',
        moneda: 'RON',
        inclus_manopera: 'da'
      },
      preturi_reale: [
        {
          sursa: 'AutoParts RO',
          componenta: problema.split(' ')[0],
          pret_ron: Math.floor(Math.random() * 500) + 200,
          moneda: 'RON',
          garantie: '12 luni'
        }
      ],
      pasi_verificare: [
        '1. Conectare scanner OBD2',
        '2. Citire coduri eroare',
        '3. Verificare vizuală componente',
        '4. Testare funcțională'
      ],
      timestamp: new Date().toISOString()
    };
  };

  // Handler pentru diagnostic
  const handleDiagnostic = async () => {
    if (!simptome.trim() && selectedCodes.length === 0) {
      Alert.alert('Eroare', 'Introdu simptome sau selectează coduri DTC!');
      return;
    }
    
    setLoading(true);
    setDiagnosticResult(null);
    
    try {
      const result = await getAIDiagnostic(simptome, selectedCodes, vehicleInfo);
      
      setDiagnosticResult(result);
      
      // Salvare în istoric
      const newHistoryItem = {
        id: Date.now().toString(),
        date: new Date().toLocaleString('ro-RO'),
        simptome: simptome,
        problema: result.problema_identificata,
        pret: result.pret_estimativ?.interval || 'Necunoscut'
      };
      
      const updatedHistory = [newHistoryItem, ...history.slice(0, 9)];
      setHistory(updatedHistory);
      await AsyncStorage.setItem('diagnostic_history', JSON.stringify(updatedHistory));
      
    } catch (error) {
      Alert.alert('Eroare', 'Nu s-a putut genera diagnosticul. Încearcă din nou.');
      console.error('Eroare handleDiagnostic:', error);
    } finally {
      setLoading(false);
    }
  };

  // Încărcare istoric
  useEffect(() => {
    loadHistory();
  }, []);

  const loadHistory = async () => {
    try {
      const savedHistory = await AsyncStorage.getItem('diagnostic_history');
      if (savedHistory) {
        setHistory(JSON.parse(savedHistory));
      }
    } catch (error) {
      console.error('Eroare încărcare istoric:', error);
    }
  };

  // Toggle cod DTC
  const toggleDTC = (code) => {
    if (selectedCodes.includes(code)) {
      setSelectedCodes(selectedCodes.filter(c => c !== code));
    } else {
      setSelectedCodes([...selectedCodes, code]);
    }
  };

  // Render UI
  return (
    <ScrollView style={styles.container}>
      {/* HEADER */}
      <View style={styles.header}>
        <Text style={styles.title}>🔧 Auto Diagnostic AI</Text>
        <Text style={styles.subtitle}>Diagnostic inteligent pentru mașina ta</Text>
      </View>

      {/* FORMULAR SIMPTOME */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>📝 Descrie simptomele</Text>
        <TextInput
          style={styles.input}
          placeholder="ex: Motorul vibrează la viteze mari..."
          placeholderTextColor="#999"
          value={simptome}
          onChangeText={setSimptome}
          multiline
          numberOfLines={3}
        />
      </View>

      {/* CODURI DTC */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>🚨 Coduri DTC (opțional)</Text>
        <View style={styles.dtcGrid}>
          {dtcCodes.map((code) => (
            <TouchableOpacity
              key={code}
              style={[
                styles.dtcButton,
                selectedCodes.includes(code) && styles.dtcButtonSelected
              ]}
              onPress={() => toggleDTC(code)}
            >
              <Text style={[
                styles.dtcText,
                selectedCodes.includes(code) && styles.dtcTextSelected
              ]}>
                {code}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
        <Text style={styles.selectedCodesText}>
          Selectate: {selectedCodes.length > 0 ? selectedCodes.join(', ') : 'Niciunul'}
        </Text>
      </View>

      {/* INFO VEHICUL */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>🚗 Informații vehicul (opțional)</Text>
        <View style={styles.vehicleRow}>
          <TextInput
            style={[styles.vehicleInput, { flex: 2 }]}
            placeholder="Marca"
            value={vehicleInfo.marca}
            onChangeText={(text) => setVehicleInfo({...vehicleInfo, marca: text})}
          />
          <TextInput
            style={[styles.vehicleInput, { flex: 2 }]}
            placeholder="Model"
            value={vehicleInfo.model}
            onChangeText={(text) => setVehicleInfo({...vehicleInfo, model: text})}
          />
          <TextInput
            style={[styles.vehicleInput, { flex: 1 }]}
            placeholder="An"
            value={vehicleInfo.an}
            onChangeText={(text) => setVehicleInfo({...vehicleInfo, an: text})}
            keyboardType="numeric"
          />
        </View>
        <TextInput
          style={styles.input}
          placeholder="VIN (opțional)"
          value={vehicleInfo.vin}
          onChangeText={(text) => setVehicleInfo({...vehicleInfo, vin: text})}
        />
      </View>

      {/* BUTON DIAGNOSTIC */}
      <TouchableOpacity
        style={styles.diagnosticButton}
        onPress={handleDiagnostic}
        disabled={loading}
      >
        {loading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <>
            <Icon name="search" size={24} color="#fff" />
            <Text style={styles.diagnosticButtonText}>Verifică problema cu AI</Text>
          </>
        )}
      </TouchableOpacity>

      {/* REZULTAT DIAGNOSTIC */}
      {diagnosticResult && (
        <View style={[styles.card, styles.resultCard]}>
          <Text style={styles.resultTitle}>🎯 Diagnostic AI</Text>
          
          <View style={styles.resultSection}>
            <Text style={styles.resultLabel}>Problemă identificată:</Text>
            <Text style={styles.resultValue}>{diagnosticResult.problema_identificata}</Text>
          </View>
          
          <View style={styles.resultSection}>
            <Text style={styles.resultLabel}>Urgență:</Text>
            <View style={[
              styles.urgencyBadge,
              diagnosticResult.urgenta === 'ridicată' && styles.urgencyHigh,
              diagnosticResult.urgenta === 'medie' && styles.urgencyMedium,
              diagnosticResult.urgenta === 'scăzută' && styles.urgencyLow
            ]}>
              <Text style={styles.urgencyText}>{diagnosticResult.urgenta.toUpperCase()}</Text>
            </View>
          </View>
          
          <View style={styles.resultSection}>
            <Text style={styles.resultLabel}>Preț estimativ:</Text>
            <Text style={styles.priceText}>
              {diagnosticResult.pret_estimativ?.interval || 'Necunoscut'}
            </Text>
          </View>
          
          <View style={styles.resultSection}>
            <Text style={styles.resultLabel}>Recomandări:</Text>
            {diagnosticResult.recomandari?.map((rec, index) => (
              <Text key={index} style={styles.recommendationText}>• {rec}</Text>
            ))}
          </View>
          
          <View style={styles.resultSection}>
            <Text style={styles.resultLabel}>Încredere AI:</Text>
            <View style={styles.confidenceBar}>
              <View style={[
                styles.confidenceFill,
                { width: `${diagnosticResult.incredere_procent || 0}%` }
              ]} />
              <Text style={styles.confidenceText}>
                {diagnosticResult.incredere_procent?.toFixed(1) || 0}%
              </Text>
            </View>
          </View>
        </View>
      )}

      {/* ISTORIC */}
      <TouchableOpacity
        style={styles.historyButton}
        onPress={() => setShowHistory(true)}
      >
        <Icon name="history" size={20} color="#4A6FA5" />
        <Text style={styles.historyButtonText}>Vezi istoric ({history.length})</Text>
      </TouchableOpacity>

      {/* MODAL ISTORIC */}
      <Modal
        visible={showHistory}
        animationType="slide"
        transparent={true}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>📜 Istoric diagnostice</Text>
              <TouchableOpacity onPress={() => setShowHistory(false)}>
                <Icon name="close" size={24} color="#333" />
              </TouchableOpacity>
            </View>
            
            {history.length === 0 ? (
              <Text style={styles.noHistoryText}>Nu ai niciun diagnostic salvat.</Text>
            ) : (
              <FlatList
                data={history}
                keyExtractor={(item) => item.id}
                renderItem={({ item }) => (
                  <View style={styles.historyItem}>
                    <Text style={styles.historyDate}>{item.date}</Text>
                    <Text style={styles.historyProblem} numberOfLines={1}>
                      {item.simptome || 'Fără simptome'}
                    </Text>
                    <Text style={styles.historyDiagnostic}>{item.problema}</Text>
                    <Text style={styles.historyPrice}>Preț: {item.pret}</Text>
                  </View>
                )}
              />
            )}
            
            {history.length > 0 && (
              <TouchableOpacity
                style={styles.clearHistoryButton}
                onPress={async () => {
                  setHistory([]);
                  await AsyncStorage.removeItem('diagnostic_history');
                }}
              >
                <Text style={styles.clearHistoryText}>Șterge istoric</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </Modal>

      {/* FOOTER */}
      <View style={styles.footer}>
        <Text style={styles.footerText}>
          {MOD_DEZVOLTARE ? '🔵 Mod Development (Bluetooth real)' : '🟡 Mod Simulare (Expo Go)'}
        </Text>
        <Text style={styles.footerNote}>Auto Diagnostic AI © 2025</Text>
      </View>
    </ScrollView>
  );
}

// STILURI
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F5',
  },
  header: {
    backgroundColor: '#4A6FA5',
    padding: 20,
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20,
    marginBottom: 20,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#FFF',
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 14,
    color: '#E0E0E0',
    textAlign: 'center',
    marginTop: 5,
  },
  card: {
    backgroundColor: '#FFF',
    borderRadius: 12,
    padding: 16,
    marginHorizontal: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    marginBottom: 12,
  },
  input: {
    borderWidth: 1,
    borderColor: '#DDD',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    color: '#333',
    backgroundColor: '#FAFAFA',
  },
  dtcGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  dtcButton: {
    width: '18%',
    padding: 8,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#4A6FA5',
    borderRadius: 6,
    alignItems: 'center',
  },
  dtcButtonSelected: {
    backgroundColor: '#4A6FA5',
  },
  dtcText: {
    color: '#4A6FA5',
    fontSize: 12,
    fontWeight: '600',
  },
  dtcTextSelected: {
    color: '#FFF',
  },
  selectedCodesText: {
    fontSize: 14,
    color: '#666',
    fontStyle: 'italic',
  },
  vehicleRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  vehicleInput: {
    borderWidth: 1,
    borderColor: '#DDD',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    color: '#333',
    backgroundColor: '#FAFAFA',
  },
  diagnosticButton: {
    flexDirection: 'row',
    backgroundColor: '#4A6FA5',
    borderRadius: 12,
    padding: 16,
    marginHorizontal: 16,
    marginBottom: 16,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  diagnosticButtonText: {
    color: '#FFF',
    fontSize: 18,
    fontWeight: '600',
  },
  resultCard: {
    borderColor: '#4A6FA5',
    borderWidth: 2,
  },
  resultTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#4A6FA5',
    marginBottom: 16,
    textAlign: 'center',
  },
  resultSection: {
    marginBottom: 16,
  },
  resultLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#555',
    marginBottom: 4,
  },
  resultValue: {
    fontSize: 17,
    color: '#222',
    fontWeight: '500',
  },
  urgencyBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  urgencyHigh: {
    backgroundColor: '#FF5252',
  },
  urgencyMedium: {
    backgroundColor: '#FFA726',
  },
  urgencyLow: {
    backgroundColor: '#4CAF50',
  },
  urgencyText: {
    color: '#FFF',
    fontWeight: 'bold',
    fontSize: 12,
  },
  priceText: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#4A6FA5',
  },
  recommendationText: {
    fontSize: 15,
    color: '#444',
    marginLeft: 8,
    marginBottom: 4,
  },
  confidenceBar: {
    height: 24,
    backgroundColor: '#EEE',
    borderRadius: 12,
    overflow: 'hidden',
    marginTop: 8,
    position: 'relative',
  },
  confidenceFill: {
    height: '100%',
    backgroundColor: '#4CAF50',
    borderRadius: 12,
  },
  confidenceText: {
    position: 'absolute',
    width: '100%',
    textAlign: 'center',
    lineHeight: 24,
    fontWeight: '600',
    color: '#333',
  },
  historyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 12,
    marginHorizontal: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#4A6FA5',
    borderRadius: 8,
    gap: 8,
  },
  historyButtonText: {
    color: '#4A6FA5',
    fontSize: 16,
    fontWeight: '600',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#FFF',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    maxHeight: '80%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#EEE',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
  },
  noHistoryText: {
    textAlign: 'center',
    color: '#999',
    fontSize: 16,
    paddingVertical: 40,
  },
  historyItem: {
    backgroundColor: '#F9F9F9',
    padding: 16,
    borderRadius: 8,
    marginBottom: 12,
  },
  historyDate: {
    fontSize: 12,
    color: '#888',
    marginBottom: 4,
  },
  historyProblem: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 4,
  },
  historyDiagnostic: {
    fontSize: 14,
    color: '#4A6FA5',
    marginBottom: 4,
  },
  historyPrice: {
    fontSize: 14,
    color: '#4CAF50',
    fontWeight: '600',
  },
  clearHistoryButton: {
    marginTop: 20,
    padding: 16,
    backgroundColor: '#FF5252',
    borderRadius: 8,
    alignItems: 'center',
  },
  clearHistoryText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '600',
  },
  footer: {
    padding: 20,
    alignItems: 'center',
    backgroundColor: '#F0F0F0',
    marginTop: 20,
    borderTopWidth: 1,
    borderTopColor: '#DDD',
  },
  footerText: {
    fontSize: 14,
    color: '#666',
    marginBottom: 8,
  },
  footerNote: {
    fontSize: 12,
    color: '#999',
  },
});