import socket
import subprocess
import sys

def get_local_ip():
    """Obține IP-ul local"""
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(('8.8.8.8', 80))
        ip = s.getsockname()[0]
    except Exception:
        ip = '127.0.0.1'
    finally:
        s.close()
    return ip

def update_frontend_ip(new_ip):
    """Actualizează IP-ul în frontend"""
    try:
        frontend_file = '../mobile-app/App.js'
        
        with open(frontend_file, 'r', encoding='utf-8') as f:
            content = f.read()
        
        # Înlocuiește orice IP/localhost cu IP-ul nou
        import re
        updated_content = re.sub(
            r"http://(localhost|127\.0\.0\.1|\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}):8000",
            f"http://{new_ip}:8000",
            content
        )
        
        with open(frontend_file, 'w', encoding='utf-8') as f:
            f.write(updated_content)
        
        print(f"✅ Frontend actualizat cu IP: {new_ip}")
        
    except Exception as e:
        print(f"⚠️  Nu am putut actualiza frontend: {e}")

def main():
    print("🔧 REPARARE NETWORK ERROR")
    print("="*40)
    
    # 1. Obține IP-ul
    local_ip = get_local_ip()
    print(f"📡 IP-ul tău local este: {local_ip}")
    
    # 2. Actualizează backend
    print(f"🔄 Actualizez backend-ul să ruleze pe {local_ip}")
    
    # 3. Actualizează frontend (dacă există)
    update_frontend_ip(local_ip)
    
    print("\n🎯 Pornește acum backend-ul cu:")
    print(f"   python main.py")
    print("\n📱 În frontend, folosește URL:")
    print(f"   http://{local_ip}:8000/api/v1/diagnostic")
    print("\n🔥 Network Error ar trebui rezolvat!")

if __name__ == "__main__":
    main()