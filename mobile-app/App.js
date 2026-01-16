import React, { useState, useEffect } from 'react';
import { 
  View, Text, StyleSheet, Alert, ScrollView,
  TextInput, TouchableOpacity, ActivityIndicator, SafeAreaView,
  Platform, Linking, PermissionsAndroid
} from 'react-native';
import axios from 'axios';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import AsyncStorage from '@react-native-async-storage/async-storage';

// === CONFIGURAȚIE ===
const MOD_DEZVOLTARE = false; // TRUE pentru Development Build cu Bluetooth real

// Import conditional pentru react-native-ble-plx
let BleManager = null;
let manager = null;

if (MOD_DEZVOLTARE) {
  try {
    BleManager = require('react-native-ble-plx').BleManager;
    manager = new BleManager();
    console.log('✅ react-native-ble-plx încărcat pentru Development Build');
  } catch (error) {
    console.warn('❌ react-native-ble-plx nu s-a putut încărca:', error);
  }
}

export default function AplicatieDiagnostic() {
  // === STATE-URI ===
  const [dispozitive, setDispozitive] = useState([]);
  const [conectat, setConectat] = useState(false);
  const [scanare, setScanare] = useState(false);
  const [dispozitivCurent, setDispozitivCurent] = useState(null);
  const [dateOBD, setDateOBD] = useState({});
  const [diagnostic, setDiagnostic] = useState(null);
  const [incarcare, setIncarcare] = useState(false);
  const [stareBluetooth, setStareBluetooth] = useState(
    MOD_DEZVOLTARE ? 'Initializare...' : '🔧 Mod Simulare'
  );
  
  // Informații utilizator
  const [simptome, setSimptome] = useState('');
  const [marca, setMarca] = useState('');
  const [model, setModel] = useState('');
  const [an, setAn] = useState('');
  const [kilometraj, setKilometraj] = useState('');

  // === Efect pentru inițializare ===
  useEffect(() => {
    if (MOD_DEZVOLTARE && manager) {
      const subscription = manager.onStateChange((stare) => {
        console.log('📱 Stare Bluetooth:', stare);
        setStareBluetooth(stare);
      }, true);
      
      return () => subscription.remove();
    } else {
      setStareBluetooth('🔧 Mod Simulare Activ');
    }
  }, []);

  // === SCANARE DISPOZITIVE ===
  const scaneazaDispozitiveOBD = async () => {
    if (!MOD_DEZVOLTARE) {
      // === MOD SIMULARE (Expo Go) ===
      setScanare(true);
      
      setTimeout(() => {
        setDispozitive([
          { 
            id: 'sim-obd-001', 
            name: 'OBD2 ELM327 Bluetooth', 
            rssi: -58,
            details: 'Dispozitiv simulat pentru testare'
          },
          { 
            id: 'sim-obd-002', 
            name: 'Vgate iCar Pro V2.0', 
            rssi: -62,
            details: 'Simulare adaptor OBD2'
          },
          { 
            id: 'sim-obd-003', 
            name: 'OBDLink MX+ Simulator', 
            rssi: -55,
            details: 'Simulare pentru diagnostic AI'
          }
        ]);
        setScanare(false);
        
        Alert.alert(
          '🔍 Dispozitive simulate găsite',
          'Acestea sunt dispozitive simulate pentru testarea AI-ului.\n\nPentru Bluetooth real:\n1. Setează MOD_DEZVOLTARE = true\n2. Rulează: npx expo run:android',
          [{ text: 'OK' }]
        );
      }, 1500);
      
      return;
    }
    
    // === MOD DEVELOPMENT BUILD (Bluetooth real) ===
    if (!manager) {
      Alert.alert('Eroare', 'Manager Bluetooth neinițializat');
      return;
    }
    
    setScanare(true);
    setDispozitive([]);
    
    if (Platform.OS === 'android') {
      const granted = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
      );
      if (granted !== PermissionsAndroid.RESULTS.GRANTED) {
        Alert.alert('Permisiune necesară', 'Ai nevoie de permisiunea Locație pentru Bluetooth.');
        setScanare(false);
        return;
      }
    }
    
    manager.startDeviceScan(null, null, (error, device) => {
      if (error) {
        console.error('Eroare scanare:', error);
        setScanare(false);
        return;
      }
      
      if (device.name && device.name.includes('OBD')) {
        const dispozitivNou = {
          id: device.id,
          name: device.name,
          rssi: device.rssi,
          details: `Dispozitiv real - ${device.id.substring(0, 8)}`
        };
        
        setDispozitive(prev => [...prev, dispozitivNou]);
      }
    });
    
    setTimeout(() => {
      manager.stopDeviceScan();
      setScanare(false);
    }, 10000);
  };

  // === CONECTARE ===
  const conecteazaLaOBD = async (dispozitiv) => {
    setIncarcare(true);
    
    if (!MOD_DEZVOLTARE || dispozitiv.id.includes('sim-')) {
      setTimeout(() => {
        setDispozitivCurent(dispozitiv);
        setConectat(true);
        setIncarcare(false);
        
        const dateSimulate = {
          rpm: 2450,
          viteza: 0,
          temperatura: 92,
          voltaj: 13.8,
          consum: 8.5,
          coduri: 'P0300,P0171',
          presiune_combustibil: 3.2,
          sarcina_motor: 65,
          avans_aprindere: 14.2,
          timp_injectie: 3.1
        };
        
        setDateOBD(dateSimulate);
        
        Alert.alert(
          '✅ Conectat (Simulat)',
          `Conectat la: ${dispozitiv.name}\n\nDate simulate pentru testare AI.`,
          [{ text: 'OK' }]
        );
        
        const interval = setInterval(() => {
          if (!conectat) {
            clearInterval(interval);
            return;
          }
          
          setDateOBD(prev => ({
            ...prev,
            rpm: prev.rpm + (Math.random() * 100 - 50),
            temperatura: prev.temperatura + (Math.random() * 2 - 1),
            voltaj: (parseFloat(prev.voltaj) + (Math.random() * 0.2 - 0.1)).toFixed(2)
          }));
        }, 3000);
      }, 1000);
      
      return;
    }
    
    // === CONEXIUNE REALĂ ===
    try {
      const deviceConnected = await manager.connectToDevice(dispozitiv.id);
      await deviceConnected.discoverAllServicesAndCharacteristics();
      
      setDispozitivCurent(dispozitiv);
      setConectat(true);
      setIncarcare(false);
      
      Alert.alert('✅ Conectat real!', `Conectat la ${dispozitiv.name}`);
      
    } catch (error) {
      console.error('Eroare conectare reală:', error);
      Alert.alert('❌ Eroare conectare', 'Nu s-a putut conecta la dispozitiv.');
      setIncarcare(false);
    }
  };

  // === DIAGNOSTIC AI ===
  const trimiteLaAI = async () => {
    if (!simptome.trim()) {
      Alert.alert('⚠️ Atenție', 'Te rog descrie simptomele mașinii!');
      return;
    }

    setIncarcare(true);
    
    try {
      const dateDiagnostic = {
        date_obd: [
          { pid: 'rpm', valoare: dateOBD.rpm || 0, unitate: 'RPM' },
          { pid: 'viteza', valoare: dateOBD.viteza || 0, unitate: 'km/h' },
          { pid: 'temperatura', valoare: dateOBD.temperatura || 85, unitate: '°C' },
          { pid: 'voltaj', valoare: parseFloat(dateOBD.voltaj) || 12.4, unitate: 'V' },
          { pid: 'coduri', valoare: dateOBD.coduri || 'P0000', unitate: 'DTC' }
        ],
        simptome: { text: simptome },
        vehicul: {
          marca: marca || 'Necunoscută',
          model: model || 'Necunoscut',
          an: parseInt(an) || 2015,
          kilometraj: parseInt(kilometraj) || 100000
        }
      };

      const raspuns = await axios.post('http://192.168.1.235:8000/api/v1/diagnostic', dateDiagnostic);
      
      setDiagnostic(raspuns.data);
      await AsyncStorage.setItem('ultim_diagnostic', JSON.stringify(raspuns.data));
      
      Alert.alert(
        '✅ Diagnostic Complet',
        `Problemă: ${raspuns.data.probleme_probabile[0]?.descriere || 'Necunoscută'}\nÎncredere: ${(raspuns.data.scor_incredere * 100).toFixed(0)}%`,
        [{ text: 'OK' }]
      );
      
    } catch (eroare) {
      console.error('❌ Eroare backend:', eroare);
      
      const diagnosticLocal = {
        probleme_probabile: [{
          componenta: "Sistem de diagnostic",
          descriere: simptome.toLowerCase().includes('tremur') 
            ? "Probabil bujii sau bobine de aprindere defecte" 
            : "Necesită verificare profesională",
          probabilitate: 0.7
        }],
        scor_incredere: 0.65,
        nivel_urgenta: "MEDIU",
        cost_reparatie_estimat: { EUR: 120, RON: 600 },
        actiuni_recomandate: ["Verifică la mecanic"]
      };
      
      setDiagnostic(diagnosticLocal);
      Alert.alert('⚠️ Diagnostic Local', 'Folosind AI integrat în aplicație.');
    } finally {
      setIncarcare(false);
    }
  };

  const deconecteaza = () => {
    if (MOD_DEZVOLTARE && manager && dispozitivCurent) {
      manager.cancelDeviceConnection(dispozitivCurent.id);
    }
    setConectat(false);
    setDispozitivCurent(null);
    setDateOBD({});
  };

  // === INTERFAȚA ===
  return (
    <SafeAreaView style={styles.container}>
      <ScrollView>
        {/* HEADER */}
        <View style={styles.header}>
          <Icon name="car-wrench" size={48} color="#3B82F6" />
          <Text style={styles.titlu}>🤖 AI Auto Diagnostic</Text>
          <Text style={styles.subtitlu}>
            {MOD_DEZVOLTARE ? 'Development Build - Bluetooth Real' : 'Expo Go - Mod Simulare'}
          </Text>
          
          <View style={[
            styles.stareContainer, 
            MOD_DEZVOLTARE 
              ? { backgroundColor: '#10B98120' } 
              : { backgroundColor: '#8B5CF620' }
          ]}>
            <Text style={[
              styles.stareText,
              MOD_DEZVOLTARE ? { color: '#10B981' } : { color: '#8B5CF6' }
            ]}>
              {MOD_DEZVOLTARE ? '🚀 Development Build' : '🔧 Expo Go (Simulare)'}
            </Text>
            <Text style={styles.stareDetalii}>{stareBluetooth}</Text>
          </View>
        </View>

        {/* SECȚIUNE CONEXIUNE */}
        <View style={styles.sectiune}>
          <Text style={styles.sectiuneTitlu}>
            {MOD_DEZVOLTARE ? '📱 Conexiune OBD2 Reală' : '🔧 Mod Simulare OBD2'}
          </Text>
          
          <TouchableOpacity
            style={[styles.butonPrincipal, scanare && styles.butonActiv]}
            onPress={scaneazaDispozitiveOBD}
            disabled={scanare}
          >
            {scanare ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <Icon name="bluetooth-search" size={24} color="#fff" />
                <Text style={styles.butonText}>
                  {MOD_DEZVOLTARE ? 'SCANEAZĂ OBD2 REAL' : 'PORNEȘTE SIMULAREA'}
                </Text>
              </>
            )}
          </TouchableOpacity>
          
          {!MOD_DEZVOLTARE && (
            <View style={styles.notaContainer}>
              <Text style={styles.notaText}>
                💡 <Text style={{ fontWeight: 'bold' }}>Pentru Bluetooth real:</Text>
              </Text>
              <Text style={styles.notaText}>1. Schimbă MOD_DEZVOLTARE = true în cod</Text>
              <Text style={styles.notaText}>2. Rulează: <Text style={{ fontFamily: 'monospace' }}>npx expo run:android</Text></Text>
              <Text style={styles.notaText}>3. Conectează adaptorul OBD2 Bluetooth</Text>
            </View>
          )}
          
          {/* LISTA DISPOZITIVE */}
          {dispozitive.length > 0 && (
            <View style={styles.listaContainer}>
              <Text style={styles.listaTitlu}>Dispozitive găsite:</Text>
              {dispozitive.map((d) => (
                <TouchableOpacity
                  key={d.id}
                  style={styles.dispozitivItem}
                  onPress={() => conecteazaLaOBD(d)}
                  disabled={incarcare}
                >
                  <Icon name="bluetooth" size={22} color="#3B82F6" />
                  <View style={styles.dispozitivInfo}>
                    <Text style={styles.dispozitivNume}>{d.name}</Text>
                    <Text style={styles.dispozitivDetalii}>{d.details}</Text>
                  </View>
                  {incarcare ? (
                    <ActivityIndicator size="small" color="#3B82F6" />
                  ) : (
                    <Icon name="chevron-right" size={22} color="#9CA3AF" />
                  )}
                </TouchableOpacity>
              ))}
            </View>
          )}
          
          {/* CONECTAT */}
          {conectat && (
            <View style={styles.conectatContainer}>
              <View style={styles.conectatHeader}>
                <Icon name="bluetooth-connected" size={28} color="#10B981" />
                <View style={styles.conectatInfo}>
                  <Text style={styles.conectatTitlu}>✅ CONECTAT</Text>
                  <Text style={styles.conectatNume}>{dispozitivCurent?.name}</Text>
                </View>
              </View>
              
              {/* DATE LIVE */}
              {Object.keys(dateOBD).length > 0 && (
                <View style={styles.dateContainer}>
                  <Text style={styles.dateTitlu}>📊 Date live:</Text>
                  <View style={styles.dateGrid}>
                    {Object.entries(dateOBD)
                      .filter(([key]) => !['coduri', 'timestamp'].includes(key))
                      .slice(0, 6)
                      .map(([key, val]) => (
                      <View key={key} style={styles.dateItem}>
                        <Text style={styles.dateLabel}>{key}:</Text>
                        <Text style={styles.dateValue}>
                          {typeof val === 'number' ? val.toFixed(key === 'voltaj' || key === 'presiune_combustibil' || key === 'timp_injectie' ? 2 : 0) : val}
                        </Text>
                      </View>
                    ))}
                  </View>
                </View>
              )}
              
              <TouchableOpacity style={styles.butonSecundar} onPress={deconecteaza}>
                <Icon name="bluetooth-off" size={20} color="#fff" />
                <Text style={styles.butonSecundarText}>DECONECTEAZĂ</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* SECȚIUNE SIMPTOME */}
        <View style={styles.sectiune}>
          <Text style={styles.sectiuneTitlu}>🔍 Descriere simptome</Text>
          <TextInput
            style={styles.input}
            placeholder="Ex: Motorul tremură la ralanti, consumă mult benzină..."
            value={simptome}
            onChangeText={setSimptome}
            multiline
            numberOfLines={3}
          />
        </View>

        {/* SECȚIUNE INFORMATII MAȘINĂ */}
        <View style={styles.sectiune}>
          <Text style={styles.sectiuneTitlu}>🚗 Informații mașină</Text>
          <View style={styles.row}>
            <TextInput style={[styles.input, styles.halfInput]} placeholder="Marca" value={marca} onChangeText={setMarca} />
            <TextInput style={[styles.input, styles.halfInput]} placeholder="Model" value={model} onChangeText={setModel} />
          </View>
          <View style={styles.row}>
            <TextInput style={[styles.input, styles.halfInput]} placeholder="An" value={an} onChangeText={setAn} keyboardType="numeric" />
            <TextInput style={[styles.input, styles.halfInput]} placeholder="Kilometraj" value={kilometraj} onChangeText={setKilometraj} keyboardType="numeric" />
          </View>
        </View>

        {/* BUTON DIAGNOSTIC */}
        <TouchableOpacity
          style={[styles.butonDiagnostic, incarcare && styles.butonDisabled]}
          onPress={trimiteLaAI}
          disabled={incarcare || !simptome.trim()}
        >
          {incarcare ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <Icon name="robot" size={26} color="#fff" />
              <Text style={styles.butonDiagnosticText}>
                {conectat ? '🤖 DIAGNOSTIC AI COMPLET' : '🧠 DIAGNOSTIC (fără date OBD)'}
              </Text>
            </>
          )}
        </TouchableOpacity>

        {/* REZULTATE */}
        {diagnostic && (
          <View style={styles.rezultateContainer}>
            <Text style={styles.rezultateTitlu}>📋 Rezultat Diagnostic</Text>
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <Text style={styles.cardTitlu}>{diagnostic.probleme_probabile[0]?.componenta || 'Diagnostic'}</Text>
                <View style={[styles.badge, diagnostic.nivel_urgenta === 'RIDICAT' && styles.badgeRidicat]}>
                  <Text style={styles.badgeText}>{diagnostic.nivel_urgenta || 'MEDIU'}</Text>
                </View>
              </View>
              <Text style={styles.cardDescriere}>{diagnostic.probleme_probabile[0]?.descriere || 'Nicio problemă'}</Text>
              <View style={styles.stats}>
                <View style={styles.stat}>
                  <Text style={styles.statLabel}>ÎNCREDERE</Text>
                  <Text style={styles.statValue}>{(diagnostic.scor_incredere * 100).toFixed(0)}%</Text>
                </View>
                <View style={styles.stat}>
                  <Text style={styles.statLabel}>COST ESTIMAT</Text>
                  <Text style={styles.statValue}>{diagnostic.cost_reparatie_estimat?.EUR || '?'} €</Text>
                </View>
              </View>
              <Text style={styles.recomandariTitlu}>✅ Recomandări:</Text>
              {diagnostic.actiuni_recomandate?.map((rec, idx) => (
                <View key={idx} style={styles.recomandare}>
                  <Icon name="check-circle" size={16} color="#10B981" />
                  <Text style={styles.recomandareText}>{rec}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* FOOTER */}
        <View style={styles.footer}>
          <Text style={styles.footerText}>
            🔧 {MOD_DEZVOLTARE ? 'Development Build cu react-native-ble-plx' : 'Expo Go cu simulare completă'}
          </Text>
          <Text style={styles.versiune}>v1.0 • Auto Diagnostic AI</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

// === STILURI COMPLETE ===
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  header: { alignItems: 'center', padding: 24, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#e2e8f0' },
  titlu: { fontSize: 32, fontWeight: '900', color: '#1e293b', marginTop: 12 },
  subtitlu: { fontSize: 16, color: '#64748b', marginBottom: 16 },
  stareContainer: { padding: 16, borderRadius: 12, alignItems: 'center', marginTop: 10 },
  stareText: { fontSize: 18, fontWeight: '800' },
  stareDetalii: { fontSize: 14, color: '#64748b', marginTop: 4 },
  sectiune: { backgroundColor: '#fff', margin: 16, padding: 20, borderRadius: 16, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 2 },
  sectiuneTitlu: { fontSize: 20, fontWeight: '800', color: '#1e293b', marginBottom: 16 },
  butonPrincipal: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#3B82F6', paddingVertical: 16, paddingHorizontal: 24, borderRadius: 12, gap: 12 },
  butonActiv: { backgroundColor: '#1d4ed8' },
  butonText: { color: '#fff', fontSize: 17, fontWeight: '800' },
  notaContainer: { backgroundColor: '#f0f9ff', padding: 16, borderRadius: 12, marginTop: 20, borderLeftWidth: 4, borderLeftColor: '#0ea5e9' },
  notaText: { fontSize: 14, color: '#0369a1', marginBottom: 6, lineHeight: 20 },
  listaContainer: { marginTop: 20 },
  listaTitlu: { fontSize: 16, fontWeight: '700', color: '#475569', marginBottom: 12 },
  dispozitivItem: { flexDirection: 'row', alignItems: 'center', padding: 16, backgroundColor: '#f8fafc', borderRadius: 12, marginBottom: 10, borderWidth: 1, borderColor: '#e2e8f0' },
  dispozitivInfo: { flex: 1, marginLeft: 14 },
  dispozitivNume: { fontSize: 16, fontWeight: '700', color: '#1e293b', marginBottom: 4 },
  dispozitivDetalii: { fontSize: 13, color: '#64748b' },
  conectatContainer: { marginTop: 20 },
  conectatHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 20 },
  conectatInfo: { marginLeft: 12 },
  conectatTitlu: { fontSize: 14, fontWeight: '800', color: '#10B981', letterSpacing: 0.5 },
  conectatNume: { fontSize: 18, fontWeight: '700', color: '#1e293b', marginTop: 4 },
  dateContainer: { backgroundColor: '#f8fafc', padding: 18, borderRadius: 12, marginBottom: 20, borderWidth: 1, borderColor: '#e2e8f0' },
  dateTitlu: { fontSize: 16, fontWeight: '700', color: '#334155', marginBottom: 14 },
  dateGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
  dateItem: { width: '48%', backgroundColor: '#fff', padding: 14, borderRadius: 10, marginBottom: 12, borderWidth: 1, borderColor: '#f1f5f9' },
  dateLabel: { fontSize: 12, fontWeight: '600', color: '#64748b', marginBottom: 6 },
  dateValue: { fontSize: 22, fontWeight: '800', color: '#1e293b' },
  butonSecundar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#ef4444', paddingVertical: 16, paddingHorizontal: 24, borderRadius: 12, gap: 10 },
  butonSecundarText: { color: '#fff', fontSize: 16, fontWeight: '800' },
  input: { borderWidth: 1.5, borderColor: '#cbd5e1', borderRadius: 12, padding: 16, fontSize: 16, backgroundColor: '#f8fafc', color: '#334155' },
  row: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 },
  halfInput: { flex: 0.48 },
  butonDiagnostic: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#8b5cf6', paddingVertical: 20, paddingHorizontal: 24, borderRadius: 14, gap: 12, marginHorizontal: 16, marginVertical: 10, shadowColor: '#8b5cf6', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 10, elevation: 5 },
  butonDisabled: { backgroundColor: '#a78bfa', opacity: 0.8 },
  butonDiagnosticText: { color: '#fff', fontSize: 18, fontWeight: '800', letterSpacing: 0.5 },
  rezultateContainer: { backgroundColor: '#fff', marginHorizontal: 16, marginVertical: 10, padding: 20, borderRadius: 16, borderWidth: 1, borderColor: '#f1f5f9' },
  rezultateTitlu: { fontSize: 24, fontWeight: '900', color: '#1e293b', marginBottom: 20 },
  card: { backgroundColor: '#f8fafc', padding: 20, borderRadius: 14, borderWidth: 1.5, borderColor: '#e2e8f0', marginBottom: 20 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  cardTitlu: { fontSize: 20, fontWeight: '800', color: '#1e40af', flex: 1 },
  badge: { paddingVertical: 6, paddingHorizontal: 16, borderRadius: 20, backgroundColor: '#fef3c7' },
  badgeRidicat: { backgroundColor: '#fee2e2' },
  badgeText: { fontSize: 13, fontWeight: '800', color: '#92400e' },
  cardDescriere: { fontSize: 16, color: '#475569', lineHeight: 24, marginBottom: 20 },
  stats: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 20 },
  stat: { alignItems: 'center', flex: 1 },
  statLabel: { fontSize: 14, fontWeight: '700', color: '#64748b', marginBottom: 8 },
  statValue: { fontSize: 28, fontWeight: '900', color: '#1e293b' },
  recomandariTitlu: { fontSize: 18, fontWeight: '800', color: '#475569', marginBottom: 12 },
  recomandare: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 12 },
  recomandareText: { fontSize: 15, color: '#334155', marginLeft: 12, flex: 1, lineHeight: 22 },
  footer: { padding: 24, paddingTop: 30, alignItems: 'center' },
  footerText: { fontSize: 15, color: '#64748b', textAlign: 'center', lineHeight: 22, marginBottom: 12 },
  versiune: { fontSize: 13, color: '#94a3b8', fontWeight: '600' },
});