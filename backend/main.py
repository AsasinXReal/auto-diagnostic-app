from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional, Dict, Any
import asyncio
import json
import uuid
from datetime import datetime
import re

app = FastAPI(title="API AutoDiagnostic AI", version="3.0")

# Middleware pentru CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Permite toate originile (în producție specifică domeniile)
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Modele de date (structuri)
class CadruOBD(BaseModel):
    pid: str
    valoare: float
    unitate: str
    timestamp: datetime

class Simptome(BaseModel):
    text: str
    url_audio: Optional[str] = None
    conditii: Dict[str, Any] = {}

class InformatiiVehicul(BaseModel):
    marca: str
    model: str
    an: int
    motor: str
    kilometraj: int
    vin: Optional[str] = None

class CerereDiagnostic(BaseModel):
    date_obd: List[CadruOBD]
    simptome: Simptome
    vehicul: InformatiiVehicul
    id_sesiune: str = None

class RezultatDiagnostic(BaseModel):
    id_diagnostic: str
    id_sesiune: str
    probleme_probabile: List[Dict]
    scor_incredere: float
    nivel_urgenta: str  # SCĂZUT, MEDIU, RIDICAT, CRITIC
    cost_reparatie_estimat: Dict[str, float]
    actiuni_recomandate: List[str]
    timestamp: datetime
    analiza_bruta: Optional[Dict] = None

# Stocare temporară (în producție folosești baze de date)
cache_diagnostic = {}
baza_date_vehicule = {}

@app.get("/")
async def radacina():
    return {"status": "API AutoDiagnostic AI v3.0", "endpoint-uri": ["/docs", "/api/v1/diagnostic", "/api/v1/vehicul/{vin}/probleme-comune"]}

@app.post("/api/v1/diagnostic", response_model=RezultatDiagnostic)
async def efectueaza_diagnostic(cerere: CerereDiagnostic):
    """Endpoint principal pentru diagnostic auto"""
    try:
        # Generează ID-uri unice
        id_diagnostic = str(uuid.uuid4())
        id_sesiune = cerere.id_sesiune or str(uuid.uuid4())

        # Procesează datele
        analiza_obd = await analizeaza_date_obd(cerere.date_obd)
        analiza_simptome = await analizeaza_simptome(cerere.simptome)
        context_vehicul = await obtine_context_vehicul(cerere.vehicul)

        # Rulează motorul AI
        rezultat_ai = await motor_ai_integrat(
            analiza_obd, 
            analiza_simptome, 
            context_vehicul
        )

        # Calculează cost estimativ
        cost_estimativ = await estimeaza_cost_reparatie(
            rezultat_ai["probleme_probabile"],
            cerere.vehicul
        )

        # Determină urgența
        urgenta = await determina_urgenta(
            rezultat_ai["severitate"],
            analiza_obd.get("parametri_critici", [])
        )

        # Construiește rezultatul final
        rezultat = RezultatDiagnostic(
            id_diagnostic=id_diagnostic,
            id_sesiune=id_sesiune,
            probleme_probabile=rezultat_ai["probleme_probabile"],
            scor_incredere=rezultat_ai["incredere"],
            nivel_urgenta=urgenta,
            cost_reparatie_estimat=cost_estimativ,
            actiuni_recomandate=rezultat_ai["recomandari"],
            timestamp=datetime.now(),
            analiza_bruta={
                "obd": analiza_obd,
                "simptome": analiza_simptome,
                "motor_ai": rezultat_ai
            }
        )

        # Salvează în cache
        cache_diagnostic[id_diagnostic] = rezultat.dict()

        return rezultat

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Eroare la diagnostic: {str(e)}")

@app.post("/api/v1/incarca-audio")
async def incarca_audio_pentru_analiza(
    fisier: UploadFile = File(...),
    id_sesiune: str = Form(...)
):
    """Încarcă audio pentru analiza motorului"""
    try:
        # Creează director temporar dacă nu există
        import os
        os.makedirs("audio_temporar", exist_ok=True)
        locatie_fisier = f"audio_temporar/{id_sesiune}_{fisier.filename}"
        
        # Salvează fișierul
        with open(locatie_fisier, "wb+") as obiect_fisier:
            continut = await fisier.read()
            obiect_fisier.write(continut)

        # Analizează audio
        analiza_audio = await analizeaza_audio_motor(locatie_fisier)

        # Șterge fișierul temporar
        os.remove(locatie_fisier)

        return {
            "id_sesiune": id_sesiune,
            "analiza_audio": analiza_audio,
            "status": "analizat",
            "marime_fisier_kb": len(continut) / 1024
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Eroare la încărcare audio: {str(e)}")

@app.get("/api/v1/diagnostic/{id_diagnostic}")
async def obtine_diagnostic(id_diagnostic: str):
    """Recuperează un diagnostic existent"""
    if id_diagnostic not in cache_diagnostic:
        raise HTTPException(status_code=404, detail="Diagnosticul nu a fost găsit")
    return cache_diagnostic[id_diagnostic]

@app.get("/api/v1/vehicul/{vin}/probleme-comune")
async def obtine_probleme_comune(vin: str):
    """Returnează probleme comune pentru modelul respectiv"""
    baza_date_probleme = {
        "WVWZZZ1KZ8P123456": [  # Exemplu VIN Volkswagen
            {"cod": "P0300", "descriere": "Aprindere defectuoasă multiplă", "frecventa": "RIDICATĂ", "cost_reparatie_eur": 250},
            {"cod": "P0171", "descriere": "Sistem prea slab", "frecventa": "MEDIE", "cost_reparatie_eur": 180},
            {"cod": "P0299", "descriere": "Subpresiune turbocompresor", "frecventa": "SCĂZUTĂ", "cost_reparatie_eur": 500}
        ],
        "ZFA31200004567890": [  # Exemplu VIN Fiat
            {"cod": "P0401", "descriere": "Flux EGR insuficient", "frecventa": "RIDICATĂ", "cost_reparatie_eur": 220},
            {"cod": "P0113", "descriere": "Senzor IAT ridicat", "frecventa": "MEDIE", "cost_reparatie_eur": 120}
        ]
    }
    
    return {
        "vin": vin,
        "probleme_comune": baza_date_probleme.get(vin, []),
        "sursa": "baza_date_interna",
        "numar_probleme": len(baza_date_probleme.get(vin, []))
    }

# ==================== FUNCȚII MOTOR AI ====================

async def analizeaza_date_obd(cadre_obd: List[CadruOBD]) -> Dict[str, Any]:
    """Analizează datele OBD și extrage caracteristici"""
    coduri_critice = []
    parametri_live = {}
    parametri_critici = []
    
    for cadru in cadre_obd:
        # Identifică coduri DTC critice
        if cadru.pid.startswith('P0') or cadru.pid.startswith('P1'):
            if cadru.valoare > 0:  # Cod activ
                coduri_critice.append({
                    "cod": cadru.pid,
                    "valoare": cadru.valoare,
                    "descriere": await decodifica_dtc(cadru.pid),
                    "severitate": "RIDICATĂ" if cadru.pid.startswith('P03') else "MEDIE"
                })
        
        # Agregă parametri live
        parametri_live[cadru.pid] = {
            "valoare": cadru.valoare,
            "unitate": cadru.unitate,
            "timestamp": cadru.timestamp
        }
        
        # Parametri critici pentru urgență
        if cadru.pid in ['rpm', 'temp', 'presiune_ulei'] and (
            (cadru.pid == 'temp' and cadru.valoare > 110) or
            (cadru.pid == 'presiune_ulei' and cadru.valoare < 1.5)
        ):
            parametri_critici.append(f"{cadru.pid}:{cadru.valoare}")
    
    return {
        "dtc_critice": coduri_critice,
        "parametri_live": parametri_live,
        "parametri_critici": parametri_critici,
        "status": "ANALIZAT",
        "motor_pornit": parametri_live.get('rpm', {}).get('valoare', 0) > 500,
        "supraincalzire": parametri_live.get('temp', {}).get('valoare', 0) > 105
    }

async def analizeaza_simptome(simptome: Simptome) -> Dict[str, Any]:
    """Procesează descrierea simptomelor"""
    cuvinte_cheie = {
        "tremură": ["tremur", "vibra", "scutur", "bate", "tremura", "zdrăngănește"],
        "consum": ["consum", "bea", "pompează", "mult benzina", "consum mare", "bea mult"],
        "sunet": ["zgomot", "sunet", "tropăit", "bubuit", "zdrăngănit", "scârțâit", "trosnește"],
        "putere": ["slab", "putere", "nu trage", "încețoșat", "amorsare grea", "se îneacă"],
        "pornire": ["porn", "începe", "demar", "motor porneste", "nu porneste", "se stinge"],
        "fum": ["fum", "fumeg", "noobstru", "albastru", "negru", "alb", "fumegă"]
    }
    
    detectate = {}
    text_lower = simptome.text.lower()
    
    for categorie, cuvinte in cuvinte_cheie.items():
        potriviri = [cuv for cuv in cuvinte if cuv in text_lower]
        if potriviri:
            detectate[categorie] = {
                "cuvinte_cheie": potriviri,
                "numar": len(potriviri),
                "intensitate": "RIDICATĂ" if len(potriviri) > 2 else "MEDIE"
            }
    
    return {
        "text_original": simptome.text,
        "simptome_detectate": detectate,
        "numar_simptome": len(detectate),
        "audio_disponibil": simptome.url_audio is not None,
        "simptom_principal": list(detectate.keys())[0] if detectate else "niciunul"
    }

async def obtine_context_vehicul(vehicul: InformatiiVehicul) -> Dict[str, Any]:
    """Obține informații specifice vehiculului"""
    specificatii_vehicule = {
        "VW": {
            "Golf": {"tipuri_motor": ["1.4 TSI", "2.0 TDI"], "probleme_comune": ["injector", "lanț distribuție", "pompă apă"], "fiabilitate": 7.5},
            "Passat": {"tipuri_motor": ["1.8 TSI", "2.0 TDI"], "probleme_comune": ["turbină", "cutie DSG", "EGR"], "fiabilitate": 8.0}
        },
        "BMW": {
            "320d": {"tipuri_motor": ["2.0 N47"], "probleme_comune": ["lanț distribuție", "EGR", "DPF"], "fiabilitate": 6.5},
            "520i": {"tipuri_motor": ["2.0 B48"], "probleme_comune": ["bobine aprindere", "termostat"], "fiabilitate": 8.5}
        },
        "Dacia": {
            "Logan": {"tipuri_motor": ["1.4 MPI", "1.5 dCi"], "probleme_comune": ["alternator", "senzori", "evacuare"], "fiabilitate": 9.0}
        }
    }
    
    date_marca = specificatii_vehicule.get(vehicul.marca, {})
    date_model = date_marca.get(vehicul.model, {})
    
    return {
        "marca": vehicul.marca,
        "model": vehicul.model,
        "an": vehicul.an,
        "motor": vehicul.motor,
        "kilometraj": vehicul.kilometraj,
        "probleme_cunoscute": date_model.get("probleme_comune", []),
        "scor_fiabilitate": date_model.get("fiabilitate", 7.0),
        "clasa_vehicul": await clasifica_vehicul(vehicul.marca, vehicul.model),
        "ani_vechime": datetime.now().year - vehicul.an
    }

async def motor_ai_integrat(analiza_obd: Dict, analiza_simptome: Dict, context_vehicul: Dict) -> Dict[str, Any]:
    """Motor AI complet - fusionează toate datele"""
    # Rulează analize individuale
    analiza_dtc = await analizeaza_pattern_dtc(analiza_obd.get("dtc_critice", []))
    rezultate_simptome = await analizeaza_pattern_simptome(
        analiza_simptome.get("simptome_detectate", {}), 
        context_vehicul
    )
    
    # Aplică reguli expert
    rezultate_expert = await aplica_reguli_expert(
        analiza_dtc, 
        rezultate_simptome, 
        context_vehicul,
        analiza_obd.get("parametri_live", {})
    )
    
    # Calculă încredere totală
    incredere = calculeaza_incredere(analiza_dtc, rezultate_simptome, rezultate_expert, context_vehicul)
    
    return {
        "probleme_probabile": rezultate_expert.get("probleme", []),
        "incredere": incredere,
        "severitate": rezultate_expert.get("severitate", "MEDIE"),
        "recomandari": genereaza_recomandari(rezultate_expert, incredere),
        "rezumat_analiza": {
            "bazat_pe_dtc": analiza_dtc.get("pattern"),
            "bazat_pe_simptome": rezultate_simptome.get("pattern_principal"),
            "specific_vehicul": len(context_vehicul.get("probleme_cunoscute", [])) > 0
        }
    }

async def analizeaza_pattern_dtc(lista_dtc: List[Dict]) -> Dict[str, Any]:
    """Analizează modele în codurile de eroare"""
    if not lista_dtc:
        return {"pattern": "FARA_DTC", "incredere": 0.1, "risc": "SCĂZUT"}
    
    # Detectare pattern-uri
    patternuri = {
        "APRINDERE_MULTIPLA": any('P030' in str(d.get('cod')) for d in lista_dtc),
        "PROBLEMA_COMBUSTIBIL": any(d.get('cod') in ['P0171', 'P0172', 'P0174', 'P0175'] for d in lista_dtc),
        "PROBLEMA_SENZOR_O2": any(d.get('cod', '').startswith('P013') or d.get('cod', '').startswith('P015') for d in lista_dtc),
        "PROBLEMA_TRANSMISIE": any(d.get('cod', '').startswith('P07') for d in lista_dtc),
        "PROBLEMA_TURBINA": any(d.get('cod') in ['P0299', 'P0234', 'P0235'] for d in lista_dtc)
    }
    
    patternuri_active = [p for p, activ in patternuri.items() if activ]
    
    return {
        "pattern": patternuri_active[0] if patternuri_active else "ALTELE",
        "patternuri_detectate": patternuri_active,
        "numar_dtc": len(lista_dtc),
        "incredere": min(0.9, 0.3 + (len(lista_dtc) * 0.15)),
        "risc": "RIDICAT" if len(lista_dtc) > 2 or "APRINDERE_MULTIPLA" in patternuri_active else "MEDIU"
    }

async def analizeaza_pattern_simptome(simptome: Dict, context_vehicul: Dict) -> Dict[str, Any]:
    """Analizează pattern-uri în simptome"""
    if not simptome:
        return {"pattern_principal": "FARA_SIMPTOME", "severitate": "SCĂZUTĂ", "incredere": 0.1}
    
    # Mapare simptome -> probleme probabil
    simptom_la_problema = {
        "tremură": ["aprindere", "injectoare", "suporti_motor"],
        "consum": ["sistem_combustibil", "senzori_o2", "senzor_maf"],
        "sunet": ["evacuare", "lanț_distribuție", "rulmenți"],
        "putere": ["turbină", "filtru_înfundat", "pompă_combustibil"],
        "fum": ["arde_ulei", "scurgere_antigel", "scurgere_injector"]
    }
    
    simptome_detectate = list(simptome.keys())
    cauze_probabile = []
    
    for simptom in simptome_detectate:
        if simptom in simptom_la_problema:
            cauze_probabile.extend(simptom_la_problema[simptom])
    
    # Elimină duplicate
    cauze_probabile = list(set(cauze_probabile))
    
    # Verifică dacă sunt probleme comune pentru acest model
    probleme_cunoscute = context_vehicul.get("probleme_cunoscute", [])
    potriviri = [cauza for cauza in cauze_probabile if any(problema in cauza for problema in probleme_cunoscute)]
    
    return {
        "pattern_principal": simptome_detectate[0] if simptome_detectate else "NECUNOSCUT",
        "simptome_detectate": simptome_detectate,
        "cauze_probabile": cauze_probabile,
        "potriviri_cu_probleme_cunoscute": potriviri,
        "severitate": "RIDICATĂ" if "tremură" in simptome_detectate else "MEDIE",
        "incredere": 0.7 if potriviri else 0.5
    }

async def aplica_reguli_expert(analiza_dtc: Dict, analiza_simptome: Dict, context_vehicul: Dict, date_live: Dict) -> Dict[str, Any]:
    """Aplică reguli expert bazate pe toate datele"""
    probleme = []
    severitate = "SCĂZUTĂ"
    
    # REGULA 1: Aprindere multiplă + tremură = probleme aprindere
    if (analiza_dtc.get("pattern") == "APRINDERE_MULTIPLA" and 
        "tremură" in analiza_simptome.get("simptome_detectate", [])):
        probleme.append({
            "componenta": "Sistem de aprindere",
            "descriere": "Bujii sau bobine de aprindere defecte",
            "probabilitate": 0.85,
            "complexitate_reparatie": "MEDIE",
            "ore_estimate": 2.5,
            "piese": ["bujii", "bobine", "cablu aprindere"]
        })
        severitate = "RIDICATĂ"
    
    # REGULA 2: Sistem slab + consum crescut = probleme combustibil
    elif (analiza_dtc.get("pattern") == "PROBLEMA_COMBUSTIBIL" and 
          "consum" in analiza_simptome.get("simptome_detectate", [])):
        probleme.append({
            "componenta": "Sistem de combustibil",
            "descriere": "Injectoare sau senzor MAF defect",
            "probabilitate": 0.75,
            "complexitate_reparatie": "RIDICATĂ",
            "ore_estimate": 4.0,
            "piese": ["injector", "senzor MAF", "filtru combustibil"]
        })
        severitate = "MEDIE"
    
    # REGULA 3: Problemă turbină + putere scăzută = probleme turbo
    elif (analiza_dtc.get("pattern") == "PROBLEMA_TURBINA" and 
          "putere" in analiza_simptome.get("simptome_detectate", [])):
        probleme.append({
            "componenta": "Turbocompresor",
            "descriere": "Turbină sau actuatoare defecte",
            "probabilitate": 0.70,
            "complexitate_reparatie": "RIDICATĂ",
            "ore_estimate": 6.0,
            "piese": ["turbocompresor", "wastegate", "conducte presiune"]
        })
        severitate = "RIDICATĂ"
    
    # REGULA 4: Fără DTC dar cu simptome = diagnostic general
    if not probleme and analiza_simptome.get("simptome_detectate"):
        probleme.append({
            "componenta": "Sistem necunoscut",
            "descriere": "Necesită diagnostic profesional cu scaner specializat",
            "probabilitate": 0.3,
            "complexitate_reparatie": "NECUNOSCUTĂ",
            "ore_estimate": 1.0,
            "piese": []
        })
        severitate = "SCĂZUTĂ"
    
    # Verifică dacă sunt probleme comune pentru acest model
    probleme_cunoscute = context_vehicul.get("probleme_cunoscute", [])
    for problema in probleme[:]:  # Copie pentru iterare sigură
        if any(cunoscut in problema["descriere"].lower() for cunoscut in probleme_cunoscute):
            problema["potriveste_problema_model"] = True
            problema["probabilitate"] = min(0.95, problema["probabilitate"] + 0.15)
    
    return {
        "probleme": probleme,
        "severitate": severitate,
        "numar_reguli_aplicate": 4,
        "versiune_sistem_expert": "1.2"
    }

def calculeaza_incredere(analiza_dtc: Dict, analiza_simptome: Dict, rezultate_expert: Dict, context_vehicul: Dict) -> float:
    """Calculează încrederea totală în diagnostic"""
    incredere_baza = 0.5
    
    # Contribuția DTC
    incredere_dtc = analiza_dtc.get("incredere", 0.1)
    incredere_baza += incredere_dtc * 0.3
    
    # Contribuția simptome
    incredere_simptome = analiza_simptome.get("incredere", 0.1)
    incredere_baza += incredere_simptome * 0.3
    
    # Contribuția vehicul (dacă știm probleme comune)
    if context_vehicul.get("probleme_cunoscute"):
        incredere_baza += 0.15
    
    # Bonus pentru multiple surse de date
    if incredere_dtc > 0.5 and incredere_simptome > 0.5:
        incredere_baza += 0.1
    
    return min(0.95, max(0.1, incredere_baza))

def genereaza_recomandari(rezultate_expert: Dict, incredere: float) -> List[str]:
    """Generează recomandări personalizate"""
    recomandari = []
    probleme = rezultate_expert.get("probleme", [])
    
    if not probleme:
        return ["Mașina pare să funcționeze normal. Monitorizează pentru orice simptom nou."]
    
    # Recomandări generale
    recomandari.append(f"Încredere diagnostic: {incredere:.0%}")
    
    for problema in probleme:
        if problema["probabilitate"] > 0.7:
            recomandari.append(f"✔️ Prioritar: {problema['descriere']}")
        else:
            recomandari.append(f"⚠️ Verifică: {problema['descriere']}")
    
    # Recomandări de acțiune
    if incredere > 0.8:
        recomandari.append("🔧 Recomandat: Programează o verificare la service")
    elif incredere > 0.5:
        recomandari.append("👨‍🔧 Sfat: Consultă un mecanic pentru confirmare")
    else:
        recomandari.append("📊 Sfat: Colectează mai multe date (test drive, scanări suplimentare)")
    
    # Siguranță
    if rezultate_expert.get("severitate") == "RIDICATĂ":
        recomandari.insert(0, "🚨 URGENT: Limitează utilizarea mașinii până la diagnostic!")
    
    return recomandari

async def estimeaza_cost_reparatie(probleme: List[Dict], vehicul: Dict) -> Dict[str, float]:
    """Estimează costul reparațiilor"""
    harta_costuri = {
        "Sistem de aprindere": {"EUR": 200, "RON": 1000, "USD": 220, "ore": 2.5},
        "Sistem de combustibil": {"EUR": 350, "RON": 1750, "USD": 380, "ore": 4.0},
        "Turbocompresor": {"EUR": 800, "RON": 4000, "USD": 880, "ore": 6.0},
        "Sistem de evacuare": {"EUR": 150, "RON": 750, "USD": 160, "ore": 2.0},
        "Sistem necunoscut": {"EUR": 120, "RON": 600, "USD": 130, "ore": 1.0}
    }
    
    total = {"EUR": 0, "RON": 0, "USD": 0, "ore_estimate": 0}
    
    for problema in probleme:
        componenta = problema.get("componenta", "")
        for cheie in harta_costuri:
            if cheie in componenta:
                for moneda in ["EUR", "RON", "USD"]:
                    total[moneda] += harta_costuri[cheie][moneda]
                total["ore_estimate"] += harta_costuri[cheie]["ore"]
                break
    
    # Dacă nu găsim, cost mediu de diagnostic
    if total["EUR"] == 0:
        total = {"EUR": 120, "RON": 600, "USD": 130, "ore_estimate": 1.0}
    
    # Ajustare pentru vechime (mașini vechi au piese mai ieftine)
    an_curent = datetime.now().year
    vechime_vehicul = an_curent - vehicul.get("an", an_curent)
    if vechime_vehicul > 10:
        for moneda in ["EUR", "RON", "USD"]:
            total[moneda] *= 0.8  # Reducere 20% pentru mașini vechi
    
    return total

async def determina_urgenta(severitate: str, parametri_critici: List) -> str:
    """Determină nivelul de urgență"""
    if severitate == "RIDICATĂ" or any('temp:' in p and float(p.split(':')[1]) > 110 for p in parametri_critici[:3]):
        return "RIDICAT"
    elif severitate == "MEDIE" or parametri_critici:
        return "MEDIU"
    return "SCĂZUT"

async def decodifica_dtc(cod_dtc: str) -> str:
    """Decodifică cod DTC în descriere"""
    baza_date_dtc = {
        "P0300": "Aprindere defectuoasă multiplă detectată",
        "P0301": "Aprindere defectuoasă cilindrul 1",
        "P0302": "Aprindere defectuoasă cilindrul 2",
        "P0303": "Aprindere defectuoasă cilindrul 3",
        "P0304": "Aprindere defectuoasă cilindrul 4",
        "P0171": "Sistem prea slab (Bancă 1)",
        "P0172": "Sistem prea bogat (Bancă 1)",
        "P0174": "Sistem prea slab (Bancă 2)",
        "P0175": "Sistem prea bogat (Bancă 2)",
        "P0299": "Condiție subpresiune turbocompresor",
        "P0401": "Flux recirculare gaze eșapament insuficient",
        "P0420": "Eficiență sistem catalizator sub prag",
        "P0442": "Scurgere mică sistem control emisii evaporative",
        "P0455": "Scurgere mare sistem control emisii evaporative",
        "P0500": "Defect senzor viteză vehicul",
        "P0700": "Defect sistem control transmisie"
    }
    
    return baza_date_dtc.get(cod_dtc, f"Cod DTC necunoscut: {cod_dtc}")

async def clasifica_vehicul(marca: str, model: str) -> str:
    """Clasează vehiculul"""
    marci_premium = ["BMW", "Mercedes", "Audi", "Lexus", "Volvo"]
    marci_economice = ["Dacia", "Skoda", "Renault", "Peugeot", "Fiat"]
    
    if marca in marci_premium:
        return "PREMIUM"
    elif marca in marci_economice:
        return "ECONOM"
    else:
        return "STANDARD"

async def analizeaza_audio_motor(fisier_audio: str) -> Dict[str, Any]:
    """Analizează audio motorului"""
    # Implementare simplă - în producție s-ar folosi TensorFlow pentru audio ML
    import os
    
    marime_fisier = os.path.getsize(fisier_audio) if os.path.exists(fisier_audio) else 0
    
    # Simulare analiză audio
    return {
        "audio_procesat": True,
        "marime_fisier_kb": marime_fisier / 1024,
        "patternuri_detectate": ["posibil_batere_motor", "ralanti_normal"],
        "analiza": "Audio analizat - recomandări bazate pe simptome vizuale",
        "incredere": 0.65,
        "nota": "Implementare completă necesită model ML antrenat pe sunete de motor"
    }

# Rulare server
if __name__ == "__main__":
    import uvicorn
    print("🚀 Pornire API AutoDiagnostic AI...")
    print("📚 Documentație API: http://localhost:8000/docs")
    print("🔧 Gata pentru diagnostic OBD2 + AI!")
    uvicorn.run(app, host="0.0.0.0", port=8000)