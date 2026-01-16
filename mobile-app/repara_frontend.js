const fs = require('fs');
const path = require('path');

console.log('🔧 REPARARE FRONTEND PENTRU BACKEND');
console.log('='*40);

const appJsPath = path.join(__dirname, 'App.js');

// Citește fișierul
let content = fs.readFileSync(appJsPath, 'utf8');

// Înlocuiește funcția getAIDiagnostic
const newFunction = `
const getAIDiagnostic = async (simptomeText, selectedCodes, vehicleInfo) => {
  console.log('🔄 TRIMIT CĂTRE BACKEND...');
  
  const requestData = {
    simptome: simptomeText || "",
    coduri_dtc: selectedCodes || [],
    marca: vehicleInfo?.marca || "",
    model: vehicleInfo?.model || "",
    an_fabricatie: vehicleInfo?.an ? parseInt(vehicleInfo.an) : null,
    vin: vehicleInfo?.vin || null
  };
  
  console.log('📦 DATE TRIMISE:', JSON.stringify(requestData, null, 2));
  
  try {
    const response = await axios.post(
      'http://localhost:8000/api/v1/diagnostic',
      requestData,
      {
        headers: { 'Content-Type': 'application/json' },
        timeout: 15000
      }
    );
    
    console.log('✅ RĂSPUNS BACKEND PRIMIT');
    return response.data;
    
  } catch (error) {
    console.error('❌ EROARE:', {
      status: error.response?.status,
      data: error.response?.data,
      message: error.message
    });
    
    // Fallback
    return {
      succes: false,
      problema_identificata: "Eroare de conexiune",
      pret_estimativ: { interval: "Verifică backend-ul", moneda: "RON" }
    };
  }
};
`;

// Găsește și înlocuiește funcția veche
const oldFunctionRegex = /const getAIDiagnostic = async \([\s\S]*?\) => \{[\s\S]*?\}(?=\nconst|\n\})/;
content = content.replace(oldFunctionRegex, newFunction);

// Scrie fișierul nou
fs.writeFileSync(appJsPath, content, 'utf8');

console.log('✅ Frontend reparat!');
console.log('🎯 Rulează acum: npm start');