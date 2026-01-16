@echo off
echo 🧪 TESTEZ BACKEND-UL AUTO-DIAGNOSTIC
echo =====================================

echo 1. Test GET /
curl http://localhost:8000
echo.

echo 2. Test POST simplu
curl -X POST http://localhost:8000/api/v1/diagnostic ^
  -H "Content-Type: application/json" ^
  -d "{\"simptome\":\"Test simplu\",\"coduri_dtc\":[]}"
echo.

echo 3. Test POST complet
curl -X POST http://localhost:8000/api/v1/diagnostic ^
  -H "Content-Type: application/json" ^
  -d "{\"simptome\":\"Motorul face zgomot si vibreaza\",\"coduri_dtc\":[\"P0300\",\"P0171\"],\"marca\":\"Dacia\",\"model\":\"Logan\"}"
echo.

echo ✅ Toate testele au fost rulate!
pause