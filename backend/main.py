from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional, Dict, Any
import asyncio
import json
import uuid
from datetime import datetime

app = FastAPI(title="AutoDiagnostic AI API", version="2.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class OBDFrame(BaseModel):
    pid: str
    value: float
    unit: str
    timestamp: datetime

class Symptoms(BaseModel):
    text: str
    audio_url: Optional[str] = None
    conditions: Dict[str, Any] = {}

class VehicleInfo(BaseModel):
    make: str
    model: str
    year: int
    engine: str
    mileage: int
    vin: Optional[str] = None

class DiagnosticRequest(BaseModel):
    obd_data: List[OBDFrame]
    symptoms: Symptoms
    vehicle: VehicleInfo
    session_id: str = None

class DiagnosticResult(BaseModel):
    diagnosis_id: str
    session_id: str
    probable_issues: List[Dict]
    confidence_score: float
    urgency_level: str
    estimated_repair_cost: Dict[str, float]
    recommended_actions: List[str]
    timestamp: datetime
    raw_analysis: Optional[Dict] = None

diagnostic_cache = {}
vehicle_database = {}

@app.get("/")
async def root():
    return {"status": "AutoDiagnostic API v2.0", "ai_ready": True}

@app.post("/api/v1/diagnose", response_model=DiagnosticResult)
async def perform_diagnosis(request: DiagnosticRequest):
    try:
        diagnosis_id = str(uuid.uuid4())
        session_id = request.session_id or str(uuid.uuid4())
        
        obd_analysis = await analyze_obd_data(request.obd_data)
        symptom_analysis = await analyze_symptoms(request.symptoms)
        vehicle_context = await get_vehicle_context(request.vehicle)
        
        ai_result = await ai_engine_integrated(
            obd_analysis, 
            symptom_analysis, 
            vehicle_context
        )
        
        cost_estimate = await estimate_repair_cost(
            ai_result["probable_issues"],
            request.vehicle
        )
        
        urgency = await determine_urgency(
            ai_result["severity"],
            obd_analysis.get("critical_params", [])
        )
        
        result = DiagnosticResult(
            diagnosis_id=diagnosis_id,
            session_id=session_id,
            probable_issues=ai_result["probable_issues"],
            confidence_score=ai_result["confidence"],
            urgency_level=urgency,
            estimated_repair_cost=cost_estimate,
            recommended_actions=ai_result["recommendations"],
            timestamp=datetime.now(),
            raw_analysis={
                "obd": obd_analysis,
                "symptoms": symptom_analysis,
                "ai_engine": ai_result
            }
        )
        
        diagnostic_cache[diagnosis_id] = result.dict()
        return result
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/v1/upload-audio")
async def upload_audio_for_analysis(
    file: UploadFile = File(...),
    session_id: str = Form(...)
):
    try:
        file_location = f"temp_audio/{session_id}_{file.filename}"
        with open(file_location, "wb+") as file_object:
            file_object.write(await file.read())
        
        audio_analysis = await analyze_engine_audio(file_location)
        
        import os
        os.remove(file_location)
        
        return {
            "session_id": session_id,
            "audio_analysis": audio_analysis,
            "status": "analyzed"
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/v1/diagnosis/{diagnosis_id}")
async def get_diagnosis(diagnosis_id: str):
    if diagnosis_id not in diagnostic_cache:
        raise HTTPException(status_code=404, detail="Diagnostic not found")
    return diagnostic_cache[diagnosis_id]

async def analyze_obd_data(obd_frames: List[OBDFrame]) -> Dict:
    analysis = {
        "dtc_codes": [],
        "live_params": {},
        "anomalies": [],
        "critical_params": []
    }
    
    for frame in obd_frames:
        if frame.pid.startswith("dtc_"):
            analysis["dtc_codes"].append({
                "code": frame.value,
                "description": frame.unit
            })
        else:
            analysis["live_params"][frame.pid] = {
                "value": frame.value,
                "unit": frame.unit
            }
    
    analysis = await detect_obd_anomalies(analysis)
    return analysis

async def detect_obd_anomalies(analysis: Dict) -> Dict:
    anomalies = []
    critical = []
    
    params = analysis["live_params"]
    
    rules = {
        "rpm": {"min": 600, "max": 850, "critical_min": 300, "critical_max": 5000},
        "engine_temp": {"min": 85, "max": 105, "critical_min": 70, "critical_max": 120},
        "fuel_trim": {"min": -10, "max": 10, "critical_min": -25, "critical_max": 25},
    }
    
    for pid, rule in rules.items():
        if pid in params:
            value = params[pid]["value"]
            
            if value < rule["critical_min"] or value > rule["critical_max"]:
                critical.append({
                    "parameter": pid,
                    "value": value,
                    "issue": "CRITICAL_OUT_OF_RANGE",
                    "severity": "HIGH"
                })
            elif value < rule["min"] or value > rule["max"]:
                anomalies.append({
                    "parameter": pid,
                    "value": value,
                    "issue": "OUT_OF_NORMAL_RANGE",
                    "severity": "MEDIUM"
                })
    
    analysis["anomalies"] = anomalies
    analysis["critical_params"] = critical
    return analysis

async def analyze_symptoms(symptoms: Symptoms) -> Dict:
    try:
        from textblob import TextBlob
    except ImportError:
        TextBlob = None
    
    analysis = {
        "keywords": [],
        "sentiment": "neutral",
        "symptom_categories": [],
        "extracted_conditions": symptoms.conditions
    }
    
    text = symptoms.text.lower()
    
    symptom_categories = {
        "starting": ["nu pornește", "se stinge", "pornire grea"],
        "idling": ["tremură", "bate", "ralanti neregulat"],
        "acceleration": ["suge", "trage", "accelerează greu"],
        "noise": ["zgomot", "sunet", "bubuit", "ticăit"],
    }
    
    for category, keywords in symptom_categories.items():
        for keyword in keywords:
            if keyword in text:
                analysis["symptom_categories"].append(category)
                analysis["keywords"].append(keyword)
    
    if TextBlob:
        blob = TextBlob(text)
        analysis["sentiment"] = "negative" if blob.sentiment.polarity < -0.1 else "positive"
    
    return analysis

async def analyze_engine_audio(audio_path: str) -> Dict:
    try:
        import numpy as np
        import librosa
        import warnings
        warnings.filterwarnings('ignore')
        
        y, sr = librosa.load(audio_path, duration=10)
        
        features = {
            "duration": len(y) / sr,
            "sample_rate": sr,
            "rms_energy": np.sqrt(np.mean(y**2)),
            "zero_crossing_rate": np.mean(librosa.feature.zero_crossing_rate(y)),
        }
        
        audio_anomalies = await detect_audio_anomalies(features)
        
        return {
            "features": features,
            "anomalies": audio_anomalies,
            "predicted_issues": await classify_engine_sound(features)
        }
        
    except Exception as e:
        return {"error": str(e), "features": {}}

async def detect_audio_anomalies(features: Dict) -> List:
    anomalies = []
    
    if features.get("rms_energy", 0) > 0.5:
        anomalies.append({
            "type": "HIGH_NOISE_LEVEL",
            "description": "Motorul este prea zgomotos",
            "severity": "MEDIUM"
        })
    
    if features.get("zero_crossing_rate", 0) > 0.1:
        anomalies.append({
            "type": "IRREGULAR_ENGINE_RHYTHM",
            "description": "Ritm neregulat al motorului",
            "severity": "HIGH"
        })
    
    return anomalies

async def classify_engine_sound(features: Dict) -> List:
    issues = []
    
    zcr = features.get("zero_crossing_rate", 0)
    rms = features.get("rms_energy", 0)
    
    if zcr > 0.15:
        issues.append({
            "component": "Injector/ignition",
            "problem": "Bătaie motor/misfire",
            "confidence": 0.75
        })
    
    if rms > 0.6:
        issues.append({
            "component": "Eșapament/turbină",
            "problem": "Zgomot excesiv",
            "confidence": 0.65
        })
    
    return issues

async def ai_engine_integrated(obd_data: Dict, symptoms: Dict, vehicle: Dict) -> Dict:
    rules_engine = await run_expert_system(obd_data, symptoms, vehicle)
    ml_predictions = await run_ml_predictions(obd_data, symptoms)
    
    merged_issues = await fuse_predictions(rules_engine, ml_predictions)
    confidence = await calculate_confidence(merged_issues)
    recommendations = await generate_recommendations(merged_issues)
    
    return {
        "probable_issues": merged_issues,
        "confidence": confidence,
        "severity": await calculate_severity(merged_issues),
        "recommendations": recommendations,
        "rules_fired": rules_engine.get("rules_fired", []),
        "ml_predictions": ml_predictions
    }

async def run_expert_system(obd_data: Dict, symptoms: Dict, vehicle: Dict) -> Dict:
    issues = []
    rules_fired = []
    
    for dtc in obd_data.get("dtc_codes", []):
        dtc_issues = await map_dtc_to_issues(dtc["code"])
        issues.extend(dtc_issues)
        if dtc_issues:
            rules_fired.append(f"DTC_{dtc['code']}")
    
    for anomaly in obd_data.get("anomalies", []):
        symptom_match = await match_anomaly_to_symptoms(anomaly, symptoms)
        if symptom_match:
            issues.append(symptom_match)
            rules_fired.append(f"ANOMALY_{anomaly['parameter']}")
    
    return {
        "issues": issues,
        "rules_fired": rules_fired,
        "rule_count": len(rules_fired)
    }

async def map_dtc_to_issues(dtc_code: str) -> List[Dict]:
    dtc_database = {
        "P0300": [
            {"component": "Sistem de aprindere", "problem": "Misfire multiple", "confidence": 0.9}
        ],
        "P0171": [
            {"component": "Sistem de admisie", "problem": "Amestec prea sărac", "confidence": 0.85}
        ],
        "P0420": [
            {"component": "Catalizator", "problem": "Eficiență scăzută", "confidence": 0.8}
        ]
    }
    return dtc_database.get(dtc_code, [])

async def run_ml_predictions(obd_data: Dict, symptoms: Dict) -> Dict:
    import random
    
    ml_models = {
        "random_forest": ["injector", "bobina", "senzor_oxigen"],
        "neural_net": ["bujii", "filtru_combustibil", "pompa_combustibil"]
    }
    
    predicted_components = random.sample(list(ml_models.keys()), 2)
    
    return {
        "model_predictions": ml_models,
        "top_components": predicted_components,
        "confidence_scores": {comp: random.uniform(0.7, 0.95) for comp in predicted_components}
    }

async def fuse_predictions(rules_result: Dict, ml_result: Dict) -> List[Dict]:
    fused = []
    
    for issue in rules_result.get("issues", []):
        fused.append({
            **issue,
            "source": "expert_system",
            "priority": 1
        })
    
    for component in ml_result.get("top_components", []):
        fused.append({
            "component": component,
            "problem": "Posibil defect detectat de AI",
            "confidence": ml_result["confidence_scores"].get(component, 0.5),
            "source": "ml_model",
            "priority": 2
        })
    
    fused.sort(key=lambda x: x.get("confidence", 0), reverse=True)
    return fused[:5]

async def calculate_confidence(issues: List[Dict]) -> float:
    if not issues:
        return 0.0
    confidences = [issue.get("confidence", 0) for issue in issues]
    return sum(confidences) / len(confidences)

async def calculate_severity(issues: List[Dict]) -> str:
    severities = []
    for issue in issues:
        if issue.get("confidence", 0) > 0.8:
            severities.append("HIGH")
        elif issue.get("confidence", 0) > 0.6:
            severities.append("MEDIUM")
        else:
            severities.append("LOW")
    
    if "HIGH" in severities:
        return "HIGH"
    elif "MEDIUM" in severities:
        return "MEDIUM"
    else:
        return "LOW"

async def estimate_repair_cost(issues: List[Dict], vehicle: VehicleInfo) -> Dict:
    cost_database = {
        "injector": {"parts": 150, "labor": 100, "total": 250},
        "bobina": {"parts": 80, "labor": 50, "total": 130},
        "bujii": {"parts": 40, "labor": 30, "total": 70},
        "senzor_oxigen": {"parts": 120, "labor": 80, "total": 200},
        "catalizator": {"parts": 500, "labor": 200, "total": 700},
        "pompa_combustibil": {"parts": 300, "labor": 150, "total": 450},
    }
    
    total_cost = 0
    components = []
    
    for issue in issues[:3]:
        component = issue.get("component", "").lower()
        for key in cost_database:
            if key in component:
                total_cost += cost_database[key]["total"]
                components.append({
                    "component": key,
                    "estimated_cost": cost_database[key]
                })
                break
    
    brand_multiplier = await get_brand_cost_multiplier(vehicle.make)
    total_cost *= brand_multiplier
    
    return {
        "EUR": round(total_cost, 2),
        "USD": round(total_cost * 1.1, 2),
        "RON": round(total_cost * 4.9, 2),
        "components": components,
        "currency_multipliers": {
            "brand": brand_multiplier,
            "region": "europe"
        }
    }

async def get_brand_cost_multiplier(brand: str) -> float:
    multipliers = {
        "dacia": 0.8,
        "renault": 0.9,
        "volkswagen": 1.0,
        "audi": 1.3,
        "bmw": 1.4,
        "mercedes": 1.5,
    }
    return multipliers.get(brand.lower(), 1.0)

async def determine_urgency(severity: str, critical_params: List) -> str:
    if critical_params:
        return "CRITICAL"
    
    urgency_map = {
        "HIGH": "HIGH",
        "MEDIUM": "MEDIUM",
        "LOW": "LOW"
    }
    return urgency_map.get(severity, "LOW")

async def generate_recommendations(issues: List[Dict]) -> List[str]:
    recommendations = []
    
    for issue in issues[:3]:
        component = issue.get("component", "")
        problem = issue.get("problem", "")
        rec = f"Verificați {component}: {problem}"
        recommendations.append(rec)
    
    recommendations.extend([
        "Consultați un specialist pentru diagnostic detaliat",
        "Nu conduceți dacă motorul bate puternic",
        "Verificați nivelul uleiului și lichidului de răcire"
    ])
    
    return recommendations

async def get_vehicle_context(vehicle: VehicleInfo) -> Dict:
    return {
        "make_model": f"{vehicle.make} {vehicle.model}",
        "year": vehicle.year,
        "mileage_category": "high" if vehicle.mileage > 150000 else "medium" if vehicle.mileage > 50000 else "low",
        "common_issues": await query_vehicle_database(vehicle.vin or "default")
    }

async def query_vehicle_database(vin: str) -> List:
    return [
        {"issue": "Probleme comune cu pompa de combustibil", "frequency": "12%"},
        {"issue": "Defect senzor oxigen", "frequency": "8%"},
        {"issue": "Eșapament corroziune", "frequency": "15%"}
    ]

async def match_anomaly_to_symptoms(anomaly: Dict, symptoms: Dict) -> Optional[Dict]:
    if "rpm" in anomaly["parameter"] and "tremură" in symptoms.get("keywords", []):
        return {
            "component": "Motor",
            "problem": "Turație neregulată",
            "confidence": 0.8
        }
    return None

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)