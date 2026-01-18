"""
🚗 AUTO-DIAGNOSTIC APP BACKEND CU OBD2 BLUETOOTH
FastAPI backend cu AI multiplu + conexiune OBD2 Bluetooth + validari imbunatätite
"""

from fastapi import FastAPI, Request, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field, field_validator
from typing import Optional, Any, Dict, List
import json
import logging
import os
import httpx
import re
import asyncio
from datetime import datetime
from dotenv import load_dotenv
import random

# Încarcă variabilele de mediu
load_dotenv()

# Configurează logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Inițializează FastAPI
app = FastAPI(
    title="Auto-Diagnostic OBD2 API",
    description="AI car diagnostic system with OBD2 Bluetooth support",
    version="4.0.0"
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ============================================================================
# MODELE PYDANTIC V2 CU VALIDĂRI ÎMBUNĂTĂȚITE
# ============================================================================

class DiagnosticRequest(BaseModel):
    """Schema pentru cererea de diagnostic"""
    
    car_type: str = Field(default="standard")
    model: str = Field(default="Unknown")
    year: int = Field(default=2023)
    mileage: float = Field(default=0.0)
    battery_info: Dict[str, Any] = Field(default_factory=lambda: {"capacity": 100})
    engine_info: Dict[str, Any] = Field(default_factory=lambda: {"type": "standard"})
    simptome: List[str] = Field(default_factory=list)
    coduri_dtc: List[str] = Field(default_factory=list)
    sensors_data: Dict[str, Any] = Field(default_factory=dict)
    obd2_connected: bool = Field(default=False)
    obd2_data: Optional[Dict[str, Any]] = None
    timestamp: str = Field(default_factory=lambda: datetime.now().isoformat())
    user_id: Optional[str] = None
    session_id: Optional[str] = None
    
    model_config = {
        "extra": "allow",
        "validate_default": True,
    }
    
    @field_validator('mileage', mode='before')
    @classmethod
    def validate_mileage(cls, value):
        """Validează că kilometrajul este numeric și pozitiv"""
        if value is None:
            return 0.0
        
        # Dacă e string, încercă să extragi numere
        if isinstance(value, str):
            # Caută numere în string
            numbers = re.findall(r'\d+\.?\d*', value)
            if numbers:
                return float(numbers[0])
            return 0.0
        
        # Asigură că e float și pozitiv
        try:
            num = float(value)
            return max(0.0, num)
        except:
            return 0.0
    
    @field_validator('year', mode='before')
    @classmethod
    def validate_year(cls, value):
        """Validează anul fabricației"""
        if value is None:
            return 2023
        
        if isinstance(value, str):
            numbers = re.findall(r'\d{4}', value)
            if numbers:
                year = int(numbers[0])
                if 1950 <= year <= 2025:
                    return year
        
        try:
            year = int(value)
            if 1950 <= year <= 2025:
                return year
            return 2023
        except:
            return 2023
    
    @field_validator('simptome', mode='before')
    @classmethod
    def ensure_simptome_list(cls, value):
        if value is None:
            return []
        if isinstance(value, str):
            try:
                return json.loads(value)
            except:
                return [value.strip()] if value.strip() else []
        if not isinstance(value, list):
            return [str(value)] if value else []
        return [str(item).strip() for item in value if str(item).strip()]
    
    @field_validator('coduri_dtc', mode='before')
    @classmethod
    def ensure_coduri_dtc_list(cls, value):
        if value is None:
            return []
        if isinstance(value, str):
            try:
                return json.loads(value)
            except:
                # Extrage coduri DTC din text (ex: "P0300, B0100")
                codes = re.findall(r'[A-Z]\d{4}', value.upper())
                return codes if codes else ([value.strip()] if value.strip() else [])
        if not isinstance(value, list):
            return [str(value).upper()] if value else []
        return [str(item).upper().strip() for item in value if str(item).strip()]


class DiagnosticResponse(BaseModel):
    """Răspuns de la sistemul de diagnostic"""
    diagnostic: str
    problems: List[str]
    solutions: List[str]
    total_price: float
    ai_confidence: float
    processing_time: str
    ai_engine_used: str
    car_type: Optional[str] = None
    model: Optional[str] = None
    timestamp: Optional[str] = None
    obd2_analysis: Optional[Dict[str, Any]] = None


class OBD2ConnectionRequest(BaseModel):
    """Cerere pentru conexiune OBD2"""
    device_name: str = Field(default="OBD2 Bluetooth")
    device_address: Optional[str] = None
    protocol: str = Field(default="Auto")
    timeout: int = Field(default=5, ge=1, le=30)


class OBD2Command(BaseModel):
    """Comandă OBD2"""
    command: str = Field(description="OBD2 command (ex: '0100', '0105')")
    description: Optional[str] = None


class OBD2Device(BaseModel):
    """Dispozitiv OBD2"""
    name: str
    address: str
    type: str = "OBD2"
    connected: bool = False


# ============================================================================
# SIMULATOR OBD2 BLUETOOTH
# ============================================================================

class OBD2Simulator:
    """Simulează conexiunea OBD2 Bluetooth"""
    
    def __init__(self):
        self.connected = False
        self.current_device = None
        self.protocol = "Auto"
        
    def scan_devices(self):
        """Simulează scanarea dispozitivelor Bluetooth"""
        return [
            {"name": "ELM327 OBD2", "address": "00:1A:7D:DA:71:13", "type": "OBD2"},
            {"name": "Vgate iCar Pro", "address": "00:1B:2C:3D:4E:5F", "type": "OBD2"},
            {"name": "OBDLink LX", "address": "00:0D:18:52:2C:65", "type": "OBD2"},
            {"name": "OBDLink MX+", "address": "00:0E:19:53:2D:66", "type": "OBD2"},
            {"name": "BlueDriver", "address": "00:0F:20:54:2E:67", "type": "OBD2"},
        ]
    
    def connect(self, device_address: str = None, device_name: str = None):
        """Simulează conexiunea la OBD2"""
        if device_address or device_name:
            self.connected = True
            self.current_device = device_address or device_name
            self.protocol = "ISO 15765-4"
            return {
                "status": "connected",
                "device": self.current_device,
                "protocol": self.protocol,
                "message": "Conexiune OBD2 reusita"
            }
        
        self.connected = True
        self.current_device = "ELM327 OBD2"
        return {
            "status": "connected",
            "device": self.current_device,
            "protocol": "Auto",
            "message": "Conexiune simulata la OBD2"
        }
    
    def disconnect(self):
        """Simulează deconectarea de la OBD2"""
        was_connected = self.connected
        self.connected = False
        self.current_device = None
        return {
            "status": "disconnected",
            "was_connected": was_connected,
            "message": "Deconectat de la OBD2"
        }
    
    def send_command(self, command: str):
        """Simulează trimiterea unei comenzi OBD2"""
        if not self.connected:
            return {"error": "Nu sunteti conectat la OBD2"}
        
        command = command.upper().strip()
        
        # Simulează răspunsuri pentru comenzi comune
        responses = {
            "0100": "41 00 BE 3F A8 13",  # PIDs supported
            "0101": "41 01 00 07 E0",  # Monitor status
            "0105": "41 05 7B",  # Engine coolant temp (123°C)
            "010C": "41 0C 1A F8",  # RPM (6900 RPM)
            "010D": "41 0D 35",  # Vehicle speed (53 km/h)
            "010F": "41 0F 82",  # Intake air temp (130°C)
            "0110": "41 10 03 E8",  # MAF air flow rate (1000 g/s)
            "0111": "41 11 4D",  # Throttle position (77%)
            "011C": "41 1C 01",  # OBD standards
            "012F": "41 2F 96",  # Fuel level (150%)
            "03": "43 01 00 00 00 00",  # DTC codes clear
            "04": "44",  # Clear DTC
            "07": "47 01 00",  # Pending DTC
            "09": "49 02 01 00",  # Vehicle info
            "ATZ": "ELM327 v2.1",  # Reset
            "ATI": "ELM327 v2.1",  # Identify
            "ATDP": "AUTO",  # Describe protocol
            "ATRV": "12.8V",  # Battery voltage
        }
        
        if command in responses:
            return {
                "command": command,
                "response": responses[command],
                "status": "success",
                "timestamp": datetime.now().isoformat()
            }
        else:
            # Pentru comenzi necunoscute, generează un răspuns aleatoriu
            random_response = "41 " + " ".join([f"{random.randint(0, 255):02X}" for _ in range(4)])
            return {
                "command": command,
                "response": random_response,
                "status": "unknown_command",
                "timestamp": datetime.now().isoformat()
            }
    
    def read_dtc(self):
        """Simulează citirea codurilor DTC"""
        if not self.connected:
            return {"error": "Nu sunteti conectat la OBD2"}
        
        # Coduri DTC comune
        dtc_codes = ["P0300", "P0171", "B0100", "C0032", "U0100", "P0420"]
        descriptions = [
            "Misfire cilindru multiplu detectat",
            "Sistem prea slab (Banca 1)",
            "Circuit scurt la masa - senzor impact fata",
            "Circuit senzor viteza roata stanga fata",
            "Comunicare pierduta cu modulul de control",
            "Eficienta catalizator scazuta"
        ]
        
        return {
            "dtc_count": len(dtc_codes),
            "codes": dtc_codes,
            "descriptions": descriptions,
            "severity": ["High", "Medium", "Medium", "Low", "High", "Medium"],
            "timestamp": datetime.now().isoformat()
        }
    
    def clear_dtc(self):
        """Simulează ștergerea codurilor DTC"""
        if not self.connected:
            return {"error": "Nu sunteti conectat la OBD2"}
        
        return {
            "status": "success",
            "message": "Codurile DTC au fost sterse",
            "timestamp": datetime.now().isoformat()
        }
    
    def get_live_data(self):
        """Simulează date live din mașină"""
        if not self.connected:
            return {"error": "Nu sunteti conectat la OBD2"}
        
        # Generează date realiste
        current_time = datetime.now()
        engine_on = current_time.second % 30 > 5  # Motorul e pornit 5/6 din timp
        
        if engine_on:
            rpm = random.randint(700, 3500)
            speed = random.randint(0, 120)
            coolant_temp = random.randint(75, 105)
        else:
            rpm = 0
            speed = 0
            coolant_temp = random.randint(20, 40)
        
        return {
            "engine_on": engine_on,
            "rpm": rpm,
            "speed": speed,
            "coolant_temp": coolant_temp,
            "throttle_position": random.randint(10, 90) if engine_on else 0,
            "maf": round(random.uniform(2.5, 15.5), 1) if engine_on else 0,
            "engine_load": random.randint(20, 95) if engine_on else 0,
            "fuel_pressure": random.randint(350, 450),
            "intake_temp": random.randint(15, 45),
            "timing_advance": random.randint(5, 25) if engine_on else 0,
            "oxygen_sensor_voltage": round(random.uniform(0.1, 0.9), 2),
            "battery_voltage": round(random.uniform(12.5, 14.5), 1),
            "fuel_level": random.randint(10, 100),
            "ambient_temp": random.randint(5, 35),
            "barometric_pressure": random.randint(95, 105),
            "timestamp": current_time.isoformat()
        }


# Inițializează simulatorul OBD2
obd2_simulator = OBD2Simulator()

# ============================================================================
# SISTEM AI MULTIPLE CU ANALIZĂ OBD2
# ============================================================================

def analyze_obd2_data(obd2_data: Dict[str, Any], dtc_codes: List[str]) -> Dict[str, Any]:
    """Analizează datele OBD2 pentru probleme"""
    
    problems = []
    warnings = []
    recommendations = []
    
    if not obd2_data or "error" in obd2_data:
        return {
            "obd2_connected": False,
            "message": "Nu există date OBD2 disponibile"
        }
    
    # Analiză RPM
    rpm = obd2_data.get('rpm', 0)
    speed = obd2_data.get('speed', 0)
    
    if rpm == 0 and speed > 0:
        problems.append("Motor oprit în mers (coasting)")
    elif rpm > 4000 and speed < 20:
        warnings.append("RPM prea mare la viteză mică - posibil ambreiaj")
    elif rpm < 600 and obd2_data.get('engine_on', True):
        warnings.append("Turație joasă la relanti - posibil mură motor")
    
    # Analiză temperatură
    coolant_temp = obd2_data.get('coolant_temp', 90)
    if coolant_temp > 105:
        problems.append("Supraîncălzire motor - risc daune majore")
        recommendations.append("Opriți motorul imediat și verificați lichid de răcire")
    elif coolant_temp > 100:
        warnings.append("Temperatură motor ridicată")
    elif coolant_temp < 70 and obd2_data.get('engine_on', True):
        warnings.append("Motorul nu ajunge la temperatură optimă de funcționare")
    
    # Analiză presiune combustibil
    fuel_pressure = obd2_data.get('fuel_pressure', 400)
    if fuel_pressure < 300:
        problems.append("Presiune combustibil scăzută - posibil pompă defectă")
    elif fuel_pressure > 500:
        warnings.append("Presiune combustibil prea mare - risc daune injectoare")
    
    # Analiză senzor oxigen
    o2_voltage = obd2_data.get('oxygen_sensor_voltage', 0.5)
    if o2_voltage < 0.1 or o2_voltage > 0.9:
        problems.append("Senzor oxigen defect - consum crescut")
    
    # Analiză tensiune baterie
    battery_voltage = obd2_data.get('battery_voltage', 13.5)
    if battery_voltage < 12.0:
        problems.append("Baterie descărcată - risc defecțiune")
    elif battery_voltage > 15.0:
        warnings.append("Tensiune baterie prea mare - posibil regulator defect")
    
    # Analiză nivel combustibil
    fuel_level = obd2_data.get('fuel_level', 50)
    if fuel_level < 15:
        warnings.append("Nivel combustibil foarte scăzut - risc pompă combustibil")
    
    # Analiză coduri DTC
    dtc_analysis = []
    dtc_severity = {"high": [], "medium": [], "low": []}
    
    for code in dtc_codes:
        if code.startswith('P0'):
            category = "Motor"
            severity = "high"
        elif code.startswith('P1'):
            category = "Combustibil/Aer"
            severity = "medium"
        elif code.startswith('P2'):
            category = "Injectoare"
            severity = "high"
        elif code.startswith('B'):
            category = "Caroserie"
            severity = "medium"
        elif code.startswith('C'):
            category = "Șasiu"
            severity = "medium"
        elif code.startswith('U'):
            category = "Comunicare"
            severity = "high"
        else:
            category = "Necunoscut"
            severity = "low"
        
        dtc_analysis.append({
            "code": code,
            "category": category,
            "severity": severity
        })
        
        if severity == "high":
            dtc_severity["high"].append(code)
        elif severity == "medium":
            dtc_severity["medium"].append(code)
        else:
            dtc_severity["low"].append(code)
    
    # Adaugă probleme bazate pe severitate coduri DTC
    if dtc_severity["high"]:
        problems.append(f"Coduri eroare critice: {', '.join(dtc_severity['high'][:3])}")
    if dtc_severity["medium"]:
        warnings.append(f"Coduri eroare medii: {', '.join(dtc_severity['medium'][:3])}")
    
    return {
        "obd2_connected": True,
        "live_data": {
            "rpm": rpm,
            "speed": speed,
            "coolant_temp": coolant_temp,
            "battery_voltage": battery_voltage,
            "fuel_pressure": fuel_pressure
        },
        "problems": problems[:5],  # Maxim 5 probleme
        "warnings": warnings[:5],  # Maxim 5 avertizări
        "recommendations": recommendations[:3],  # Maxim 3 recomandări
        "dtc_analysis": dtc_analysis,
        "summary": {
            "total_problems": len(problems),
            "total_warnings": len(warnings),
            "critical_issues": len(dtc_severity["high"]) > 0
        }
    }


def create_enhanced_prompt(car_data: Dict[str, Any], obd2_analysis: Dict[str, Any] = None) -> str:
    """Creează prompt pentru AI bazat pe toate datele"""
    
    car_type = car_data.get('car_type', 'standard')
    model = car_data.get('model', 'Unknown')
    year = car_data.get('year', 2023)
    mileage = car_data.get('mileage', 0.0)
    symptoms = car_data.get('simptome', [])
    dtc_codes = car_data.get('coduri_dtc', [])
    
    prompt = f"""
# EXPERT AUTO-DIAGNOSTIC ROMÂNIA 2025
Ești mecanician expert cu 20+ ani experiență în România.

## DATE MAȘINĂ CLIENT:
- MARCA/MODEL: {car_type} {model}
- AN FABRICAȚIE: {year}
- KILOMETRAJ: {mileage} km
- SIMPTOME RAPORTATE: {', '.join(symptoms) if symptoms else 'NICIUNUL'}
- CODURI EROARE: {', '.join(dtc_codes) if dtc_codes else 'NICIUNUL'}
"""

    # Adaugă date OBD2 dacă sunt disponibile
    if obd2_analysis and obd2_analysis.get('obd2_connected'):
        prompt += f"""
## DATE OBD2 LIVE:
- RPM: {obd2_analysis.get('live_data', {}).get('rpm', 'N/A')}
- VITEZĂ: {obd2_analysis.get('live_data', {}).get('speed', 'N/A')} km/h
- TEMP. MOTOR: {obd2_analysis.get('live_data', {}).get('coolant_temp', 'N/A')}°C
- TENSIUNE BATERIE: {obd2_analysis.get('live_data', {}).get('battery_voltage', 'N/A')}V
"""
        
        if obd2_analysis.get('problems'):
            prompt += f"- PROBLEME DETECTATE: {', '.join(obd2_analysis['problems'])}\n"
        if obd2_analysis.get('warnings'):
            prompt += f"- AVERTIZĂRI: {', '.join(obd2_analysis['warnings'])}\n"

    prompt += f"""
## CERINȚE DIAGNOSTIC:
1. Analizează toate datele disponibile (mașină + OBD2)
2. Identifică problemele cele mai probabile
3. Sugerează soluții practice pentru România
4. Estimează costuri realiste (RON/EUR) pentru 2025
5. Acordă nivel de încredere bazat pe datele disponibile

## FORMAT RĂSPUNS OBLIGATORIU (JSON):
{{
    "diagnostic": "Diagnostic scurt și clar",
    "problems": ["problemă 1", "problemă 2", "problemă 3"],
    "solutions": ["soluție 1", "soluție 2", "soluție 3"],
    "total_price": 1234.56,
    "ai_confidence": 0.92
}}

## REGULI STRICTE:
- Prețurile pentru România 2025 (RON sau EUR)
- Maxim 5 probleme și 5 soluții
- Soluții practice și aplicabile
- Dacă date insuficiente, ai_confidence sub 0.7
"""
    
    return prompt


async def get_ai_response_with_fallback(prompt: str) -> Optional[Dict[str, Any]]:
    """Obține răspuns de la AI cu multiple fallback-uri"""
    
    ai_engines = [
        ("openai", call_openai_gpt),
        ("gemini", call_google_gemini),
        ("local", call_local_llm),
    ]
    
    for engine_name, engine_func in ai_engines:
        try:
            logger.info(f"Încerc motorul AI: {engine_name}")
            result = await engine_func(prompt)
            if result and validate_ai_response(result):
                result["ai_engine"] = engine_name
                logger.info(f"✅ Motor {engine_name} a răspuns cu succes")
                return result
        except Exception as e:
            logger.warning(f"Motor {engine_name} a eșuat: {e}")
            continue
    
    # Dacă toate AI-urile eșuează, returnează None
    logger.warning("Toate motoarele AI au eșuat")
    return None


async def call_openai_gpt(prompt: str) -> Optional[Dict[str, Any]]:
    """Apel OpenAI GPT"""
    try:
        api_key = os.getenv("OPENAI_API_KEY")
        if not api_key:
            return None
        
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.post(
                "https://api.openai.com/v1/chat/completions",
                headers={
                    "Authorization": f"Bearer {api_key}",
                    "Content-Type": "application/json"
                },
                json={
                    "model": os.getenv("OPENAI_MODEL", "gpt-3.5-turbo"),
                    "messages": [
                        {
                            "role": "system", 
                            "content": "Ești expert auto. Returnează doar JSON valid."
                        },
                        {"role": "user", "content": prompt}
                    ],
                    "temperature": 0.7,
                    "max_tokens": 500,
                    "response_format": {"type": "json_object"}
                }
            )
            
            if response.status_code == 200:
                result = response.json()
                content = result["choices"][0]["message"]["content"]
                return json.loads(content)
    except Exception as e:
        logger.error(f"OpenAI error: {e}")
    
    return None


async def call_google_gemini(prompt: str) -> Optional[Dict[str, Any]]:
    """Apel Google Gemini"""
    try:
        api_key = os.getenv("GEMINI_API_KEY")
        if not api_key:
            return None
        
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.post(
                f"https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key={api_key}",
                json={
                    "contents": [{
                        "parts": [{"text": prompt}]
                    }],
                    "generationConfig": {
                        "temperature": 0.7,
                        "maxOutputTokens": 500,
                    }
                }
            )
            
            if response.status_code == 200:
                result = response.json()
                text = result["candidates"][0]["content"]["parts"][0]["text"]
                
                # Extrage JSON din răspuns
                import re
                json_match = re.search(r'\{.*\}', text, re.DOTALL)
                if json_match:
                    return json.loads(json_match.group())
    except Exception as e:
        logger.error(f"Gemini error: {e}")
    
    return None


async def call_local_llm(prompt: str) -> Optional[Dict[str, Any]]:
    """Apel local LLM (Ollama)"""
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            response = await client.post(
                "http://localhost:11434/api/generate",
                json={
                    "model": os.getenv("OLLAMA_MODEL", "mistral"),
                    "prompt": prompt,
                    "format": "json",
                    "stream": False,
                    "options": {
                        "temperature": 0.7,
                        "num_predict": 500
                    }
                }
            )
            
            if response.status_code == 200:
                result = response.json()
                return json.loads(result["response"])
    except Exception as e:
        logger.error(f"Local LLM error: {e}")
    
    return None


def validate_ai_response(response: Dict[str, Any]) -> bool:
    """Validează răspunsul AI"""
    required_fields = ["diagnostic", "problems", "solutions", "total_price", "ai_confidence"]
    
    if not isinstance(response, dict):
        return False
    
    for field in required_fields:
        if field not in response:
            return False
    
    # Validări suplimentare
    if not isinstance(response["problems"], list) or len(response["problems"]) == 0:
        return False
    
    if not isinstance(response["solutions"], list) or len(response["solutions"]) == 0:
        return False
    
    if not isinstance(response["total_price"], (int, float)) or response["total_price"] < 0:
        return False
    
    if not isinstance(response["ai_confidence"], (int, float)) or not 0 <= response["ai_confidence"] <= 1:
        return False
    
    return True


def generate_smart_diagnostic(car_data: Dict[str, Any], obd2_analysis: Dict[str, Any] = None) -> Dict[str, Any]:
    """Generează diagnostic inteligent fără AI extern"""
    
    car_type = car_data.get('car_type', 'standard').lower()
    model = car_data.get('model', '').lower()
    year = car_data.get('year', 2023)
    mileage = car_data.get('mileage', 0.0)
    symptoms = car_data.get('simptome', [])
    dtc_codes = car_data.get('coduri_dtc', [])
    
    # CALCULEAZĂ PREȚUL DE BAZĂ
    base_price = 250  # Preț minim diagnostic
    
    # Ajustări după tip mașină
    if 'tesla' in car_type or 'electric' in car_type:
        car_category = "electric"
        base_price *= 2.5
        main_system = "Sistem electric și baterie"
    elif 'bmw' in car_type or 'mercedes' in car_type or 'audi' in car_type or 'porsche' in car_type:
        car_category = "premium"
        base_price *= 2.2
        main_system = "Sistem electronic și performanță"
    elif 'dacia' in car_type or 'skoda' in car_type or 'renault' in car_type:
        car_category = "economic"
        base_price *= 0.8
        main_system = "Sistem mecanic și fiabilitate"
    elif 'toyota' in car_type or 'honda' in car_type:
        car_category = "japonez"
        base_price *= 1.2
        main_system = "Sistem hibrid și fiabilitate"
    else:
        car_category = "standard"
        base_price *= 1.0
        main_system = "Sistem general"
    
    # Ajustări după vârstă
    car_age = 2025 - year
    if car_age > 20:
        age_multiplier = 1.8
        age_issue = "Mașină foarte veche - uzură avansată"
    elif car_age > 15:
        age_multiplier = 1.5
        age_issue = "Mașină veche - uzură semnificativă"
    elif car_age > 10:
        age_multiplier = 1.3
        age_issue = "Mașină mijlocie - uzură normală"
    elif car_age > 5:
        age_multiplier = 1.1
        age_issue = "Mașină relativ nouă - uzură minimă"
    else:
        age_multiplier = 1.0
        age_issue = "Mașină nouă - probleme de garanție"
    
    # Ajustări după kilometraj
    if mileage > 300000:
        mileage_multiplier = 2.0
        mileage_issue = "Kilometraj foarte mare - revizie completă necesară"
    elif mileage > 200000:
        mileage_multiplier = 1.6
        mileage_issue = "Kilometraj mare - verificare amplă"
    elif mileage > 150000:
        mileage_multiplier = 1.4
        mileage_issue = "Kilometraj ridicat - verificare recomandată"
    elif mileage > 100000:
        mileage_multiplier = 1.2
        mileage_issue = "Kilometraj mediu - verificare periodică"
    elif mileage > 50000:
        mileage_multiplier = 1.1
        mileage_issue = "Kilometraj moderat - întreținere preventivă"
    else:
        mileage_multiplier = 1.0
        mileage_issue = "Kilometraj mic - verificare de bază"
    
    # Adaugă cost pentru simptome
    symptom_cost = len(symptoms) * 80
    
    # Adaugă cost pentru coduri eroare
    error_cost = len(dtc_codes) * 150
    
    # Adaugă cost pentru probleme OBD2
    obd2_cost = 0
    if obd2_analysis and obd2_analysis.get('obd2_connected'):
        obd2_problems = len(obd2_analysis.get('problems', []))
        obd2_warnings = len(obd2_analysis.get('warnings', []))
        obd2_cost = (obd2_problems * 200) + (obd2_warnings * 50)
    
    # Calculează prețul final
    final_price = base_price * age_multiplier * mileage_multiplier
    final_price += symptom_cost + error_cost + obd2_cost
    
    # Rotunjire la 50 RON
    final_price = round(final_price / 50) * 50
    
    # GENEREAZĂ PROBLEME ȘI SOLUȚII
    problems = []
    solutions = []
    
    # Adaugă probleme specifice
    if car_age > 10:
        problems.append(f"Vechime mașină: {car_age} ani - {age_issue}")
        solutions.append("Verificare completă a sistemului de suspensie și direcție")
    
    if mileage > 100000:
        problems.append(f"Kilometraj: {mileage:,} km - {mileage_issue}".replace(",", "."))
        solutions.append("Înlocuire distribuție și verificare compresie motor")
    
    if symptoms:
        problems.append(f"Simptome raportate: {', '.join(symptoms[:3])}")
        solutions.append("Diagnostic computerizat pentru simptomele specificate")
    
    if dtc_codes:
        problems.append(f"Coduri eroare: {', '.join(dtc_codes[:3])}")
        solutions.append("Diagnostic profund și resetare erori calculator bord")
    
    # Probleme din OBD2
    if obd2_analysis and obd2_analysis.get('problems'):
        problems.extend(obd2_analysis['problems'][:2])
    
    if obd2_analysis and obd2_analysis.get('warnings'):
        problems.extend(obd2_analysis['warnings'][:2])
    
    # Probleme default dacă nu sunt suficiente
    default_problems = [
        f"Verificare {main_system.lower()}",
        "Diagnostic computer bord obligatoriu",
        "Test sisteme de siguranță (ABS, ESP, Airbag)"
    ]
    
    default_solutions = [
        f"Service specializat pentru {car_category}",
        "Înlocuire filtre (aer, combustibil, habitaclu) și fluide",
        "Verificare și reglaj sisteme electronice"
    ]
    
    problems.extend(default_problems[:max(0, 3 - len(problems))])
    solutions.extend(default_solutions[:max(0, 3 - len(solutions))])
    
    # Calculează încrederea (0-1)
    confidence_factors = []
    
    if car_type != 'standard': confidence_factors.append(0.1)
    if model != 'unknown': confidence_factors.append(0.1)
    if year != 2023: confidence_factors.append(0.1)
    if mileage > 0: confidence_factors.append(0.1)
    if symptoms: confidence_factors.append(0.2)
    if dtc_codes: confidence_factors.append(0.2)
    if obd2_analysis and obd2_analysis.get('obd2_connected'): confidence_factors.append(0.2)
    
    ai_confidence = min(0.85, sum(confidence_factors))
    
    return {
        "diagnostic": f"Diagnostic {car_category} - {car_type} {model}",
        "problems": problems[:5],
        "solutions": solutions[:5],
        "total_price": final_price,
        "ai_confidence": round(ai_confidence, 2),
        "ai_engine": "smart_diagnostic"
    }


# ============================================================================
# MIDDLEWARE PENTRU LOGGING
# ============================================================================

@app.middleware("http")
async def log_requests(request: Request, call_next):
    """Middleware pentru logging request-uri"""
    start_time = datetime.now()
    
    # Loghează request-ul
    body = await request.body()
    request_body = body.decode('utf-8') if body else ""
    
    logger.info(f"📥 REQUEST: {request.method} {request.url}")
    logger.info(f"📦 Client: {request.client}")
    
    if request_body and len(request_body) < 1000:
        logger.info(f"📝 Body: {request_body}")
    
    # Procesează request-ul
    response = await call_next(request)
    
    # Loghează timpul de procesare
    process_time = (datetime.now() - start_time).total_seconds()
    logger.info(f"⏱️  Processing time: {process_time:.3f}s - Status: {response.status_code}")
    
    return response


# ============================================================================
# WEBSOCKET PENTRU OBD2 LIVE DATA
# ============================================================================

class ConnectionManager:
    """Manager pentru conexiuni WebSocket"""
    
    def __init__(self):
        self.active_connections: List[WebSocket] = []
    
    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)
    
    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)
    
    async def send_personal_message(self, message: str, websocket: WebSocket):
        await websocket.send_text(message)
    
    async def broadcast(self, message: str):
        for connection in self.active_connections:
            try:
                await connection.send_text(message)
            except:
                self.disconnect(connection)

manager = ConnectionManager()


@app.websocket("/ws/obd2")
async def websocket_obd2_endpoint(websocket: WebSocket):
    """WebSocket pentru date OBD2 live"""
    await manager.connect(websocket)
    try:
        while True:
            # Așteaptă comenzi de la client
            data = await websocket.receive_text()
            
            if data == "get_live_data":
                # Trimite date live simulate
                live_data = obd2_simulator.get_live_data()
                await websocket.send_json({
                    "type": "live_data",
                    "data": live_data,
                    "timestamp": datetime.now().isoformat()
                })
            
            elif data == "get_dtc":
                # Trimite coduri DTC
                dtc_data = obd2_simulator.read_dtc()
                await websocket.send_json({
                    "type": "dtc_codes",
                    "data": dtc_data,
                    "timestamp": datetime.now().isoformat()
                })
            
            elif data.startswith("command:"):
                # Execută comandă OBD2
                command = data.replace("command:", "").strip()
                result = obd2_simulator.send_command(command)
                await websocket.send_json({
                    "type": "command_response",
                    "data": result,
                    "timestamp": datetime.now().isoformat()
                })
            
            elif data == "ping":
                # Keep-alive
                await websocket.send_json({
                    "type": "pong",
                    "timestamp": datetime.now().isoformat()
                })
            
            await asyncio.sleep(0.1)
            
    except WebSocketDisconnect:
        manager.disconnect(websocket)
    except Exception as e:
        logger.error(f"WebSocket error: {e}")
        manager.disconnect(websocket)


# ============================================================================
# ENDPOINT-URI HTTP
# ============================================================================

@app.get("/")
async def root():
    """Root endpoint"""
    return {
        "message": "🚗 Auto-Diagnostic OBD2 API",
        "version": "4.0.0",
        "status": "operational",
        "features": [
            "AI Diagnostic multiplu",
            "OBD2 Bluetooth support",
            "WebSocket live data",
            "Validare inteligentă date"
        ],
        "endpoints": {
            "health": "/api/v1/health",
            "diagnostic": "/api/v1/diagnostic (POST)",
            "obd2_scan": "/api/v1/obd2/scan (GET)",
            "obd2_connect": "/api/v1/obd2/connect (POST)",
            "obd2_data": "/api/v1/obd2/data (GET)",
            "websocket": "/ws/obd2 (WebSocket)"
        },
        "timestamp": datetime.now().isoformat()
    }


@app.get("/api/v1/health")
async def health_check():
    """Health check cu status sistem"""
    # Verifică disponibilitatea AI-urilor
    ai_status = {
        "openai": os.getenv("OPENAI_API_KEY") is not None,
        "gemini": os.getenv("GEMINI_API_KEY") is not None,
        "local_llm": False
    }
    
    # Verifică Ollama
    try:
        async with httpx.AsyncClient(timeout=2.0) as client:
            response = await client.get("http://localhost:11434/api/tags")
            ai_status["local_llm"] = response.status_code == 200
    except:
        ai_status["local_llm"] = False
    
    return {
        "status": "healthy",
        "timestamp": datetime.now().isoformat(),
        "service": "auto-diagnostic-obd2",
        "version": "4.0.0",
        "ai_engines": ai_status,
        "obd2_simulator": "active",
        "smart_fallback": "enabled",
        "websocket": "available"
    }


@app.post("/api/v1/diagnostic")
async def process_diagnostic(request_data: DiagnosticRequest):
    """
    Endpoint principal pentru diagnostic auto
    """
    start_time = datetime.now()
    
    try:
        logger.info(f"🔧 Diagnostic request pentru {request_data.car_type} {request_data.model}")
        
        # Convertim la dict pentru procesare
        car_data = request_data.model_dump()
        
        # Analizează date OBD2 dacă sunt disponibile
        obd2_analysis = None
        if car_data.get('obd2_connected') and car_data.get('obd2_data'):
            obd2_analysis = analyze_obd2_data(car_data['obd2_data'], car_data['coduri_dtc'])
        
        # Obține diagnostic de la AI sau fallback
        if any([os.getenv("OPENAI_API_KEY"), os.getenv("GEMINI_API_KEY")]):
            # Încearcă AI-urile reale
            prompt = create_enhanced_prompt(car_data, obd2_analysis)
            ai_result = await get_ai_response_with_fallback(prompt)
            
            if ai_result and validate_ai_response(ai_result):
                diagnostic_result = ai_result
            else:
                # Fallback la diagnostic inteligent
                diagnostic_result = generate_smart_diagnostic(car_data, obd2_analysis)
        else:
            # Direct la diagnostic inteligent
            diagnostic_result = generate_smart_diagnostic(car_data, obd2_analysis)
        
        # Calculează timpul de procesare
        processing_time_ms = round((datetime.now() - start_time).total_seconds() * 1000, 2)
        
        # Construiește răspunsul final
        response = DiagnosticResponse(
            diagnostic=diagnostic_result.get("diagnostic", "Diagnostic general"),
            problems=diagnostic_result.get("problems", []),
            solutions=diagnostic_result.get("solutions", []),
            total_price=diagnostic_result.get("total_price", 0),
            ai_confidence=diagnostic_result.get("ai_confidence", 0.5),
            processing_time=f"{processing_time_ms}ms",
            ai_engine_used=diagnostic_result.get("ai_engine", "smart_diagnostic"),
            car_type=request_data.car_type,
            model=request_data.model,
            timestamp=datetime.now().isoformat(),
            obd2_analysis=obd2_analysis
        )
        
        logger.info(f"✅ Diagnostic generat cu {response.ai_engine_used}")
        logger.info(f"💰 Preț estimat: {response.total_price} RON")
        logger.info(f"🎯 Încredere AI: {response.ai_confidence}")
        
        return response
        
    except Exception as e:
        logger.error(f"❌ Eroare procesare diagnostic: {e}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=f"Eroare procesare diagnostic: {str(e)}"
        )


# ============================================================================
# ENDPOINT-URI OBD2
# ============================================================================

@app.get("/api/v1/obd2/scan")
async def scan_obd2_devices():
    """Scanează dispozitive OBD2 Bluetooth disponibile"""
    try:
        devices = obd2_simulator.scan_devices()
        return {
            "status": "success",
            "devices": devices,
            "count": len(devices),
            "timestamp": datetime.now().isoformat()
        }
    except Exception as e:
        logger.error(f"Eroare scanare OBD2: {e}")
        raise HTTPException(status_code=500, detail=f"Eroare scanare: {str(e)}")


@app.post("/api/v1/obd2/connect")
async def connect_obd2(request: OBD2ConnectionRequest):
    """Conectează la un dispozitiv OBD2"""
    try:
        result = obd2_simulator.connect(request.device_address, request.device_name)
        return {
            "status": "success",
            "connection": result,
            "timestamp": datetime.now().isoformat()
        }
    except Exception as e:
        logger.error(f"Eroare conectare OBD2: {e}")
        raise HTTPException(status_code=500, detail=f"Eroare conectare: {str(e)}")


@app.get("/api/v1/obd2/disconnect")
async def disconnect_obd2():
    """Deconectează de la OBD2"""
    try:
        result = obd2_simulator.disconnect()
        return {
            "status": "success",
            "disconnection": result,
            "timestamp": datetime.now().isoformat()
        }
    except Exception as e:
        logger.error(f"Eroare deconectare OBD2: {e}")
        raise HTTPException(status_code=500, detail=f"Eroare deconectare: {str(e)}")


@app.get("/api/v1/obd2/data")
async def get_obd2_data():
    """Obține date live de la OBD2"""
    try:
        # Obține date live
        live_data = obd2_simulator.get_live_data()
        
        # Obține coduri DTC
        dtc_data = obd2_simulator.read_dtc()
        
        return {
            "status": "success",
            "connected": obd2_simulator.connected,
            "device": obd2_simulator.current_device,
            "live_data": live_data,
            "dtc_codes": dtc_data,
            "timestamp": datetime.now().isoformat()
        }
    except Exception as e:
        logger.error(f"Eroare obținere date OBD2: {e}")
        raise HTTPException(status_code=500, detail=f"Eroare date: {str(e)}")


@app.post("/api/v1/obd2/command")
async def send_obd2_command(command: OBD2Command):
    """Trimite o comandă OBD2"""
    try:
        if not obd2_simulator.connected:
            raise HTTPException(status_code=400, detail="Nu sunteti conectat la OBD2")
        
        result = obd2_simulator.send_command(command.command)
        return {
            "status": "success",
            "command": command.command,
            "result": result,
            "timestamp": datetime.now().isoformat()
        }
    except Exception as e:
        logger.error(f"Eroare comandă OBD2: {e}")
        raise HTTPException(status_code=500, detail=f"Eroare comandă: {str(e)}")


@app.post("/api/v1/obd2/clear-dtc")
async def clear_obd2_dtc():
    """Șterge codurile DTC"""
    try:
        if not obd2_simulator.connected:
            raise HTTPException(status_code=400, detail="Nu sunteti conectat la OBD2")
        
        result = obd2_simulator.clear_dtc()
        return {
            "status": "success",
            "result": result,
            "timestamp": datetime.now().isoformat()
        }
    except Exception as e:
        logger.error(f"Eroare ștergere DTC: {e}")
        raise HTTPException(status_code=500, detail=f"Eroare ștergere: {str(e)}")


# ============================================================================
# UTILITARE
# ============================================================================

@app.post("/api/v1/debug")
async def debug_endpoint(request: Request):
    """Endpoint pentru debugging"""
    try:
        body_bytes = await request.body()
        body_str = body_bytes.decode('utf-8') if body_bytes else ""
        
        json_data = None
        if body_str:
            try:
                json_data = json.loads(body_str)
            except json.JSONDecodeError:
                json_data = {"raw_body": body_str}
        
        return {
            "debug": True,
            "timestamp": datetime.now().isoformat(),
            "method": request.method,
            "url": str(request.url),
            "headers": dict(request.headers),
            "content_type": request.headers.get("content-type"),
            "body_length": len(body_bytes),
            "body_preview": body_str[:500] + ("..." if len(body_str) > 500 else ""),
            "parsed_body": json_data
        }
    except Exception as e:
        return {
            "error": str(e),
            "timestamp": datetime.now().isoformat()
        }


@app.get("/api/v1/test-minimal")
async def test_minimal_diagnostic():
    """Test cu date minime"""
    test_data = {
        "car_type": "Dacia",
        "model": "Logan",
        "year": 2015,
        "mileage": "150000 km",
        "simptome": ["Consum mare", "Vibratii"],
        "coduri_dtc": ["P0171"]
    }
    
    # Creează cerere de diagnostic
    request_data = DiagnosticRequest(**test_data)
    car_data = request_data.model_dump()
    
    # Generează diagnostic
    diagnostic_result = generate_smart_diagnostic(car_data)
    
    return {
        "test": "minimal_data",
        "input_data": test_data,
        "processed_data": car_data,
        "diagnostic": diagnostic_result,
        "message": "Test cu date minime - sistemul funcționează",
        "timestamp": datetime.now().isoformat()
    }


# ============================================================================
# CONFIGURARE ȘI PORNIRE SERVER
# ============================================================================

def check_environment():
    """Verifică configurarea mediului"""
    print("=" * 60)
    print("🔧 VERIFICARE CONFIGURARE BACKEND")
    print("=" * 60)
    
    # Verifică variabile de mediu
    env_vars = {
        "OPENAI_API_KEY": os.getenv("OPENAI_API_KEY"),
        "GEMINI_API_KEY": os.getenv("GEMINI_API_KEY"),
    }
    
    for var, value in env_vars.items():
        status = "✅ SETAT" if value else "❌ LIPSESTE"
        print(f"{var}: {status}")
    
    print("-" * 60)
    print("🎯 FEATURES DISPONIBILE:")
    print(f"  • AI Diagnostic: {'✅' if any(env_vars.values()) else '⚠️  (fallback only)'}")
    print(f"  • OBD2 Bluetooth: ✅ (simulator)")
    print(f"  • WebSocket Live Data: ✅")
    print(f"  • Smart Fallback: ✅")
    print("=" * 60)


if __name__ == "__main__":
    import uvicorn
    
    # Verifică configurarea
    check_environment()
    
    # Pornește serverul
    print("\n🚀 PORNIRE SERVER AUTO-DIAGNOSTIC OBD2")
    print("📡 Server: http://0.0.0.0:8000")
    print("🌐 Acces local: http://localhost:8000")
    print("🔌 WebSocket: ws://localhost:8000/ws/obd2")
    print("=" * 60)
    
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=8000,
        reload=True,
        log_level="info"
    )