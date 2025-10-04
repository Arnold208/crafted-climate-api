import requests
import json
from typing import Dict, Any

# Configuration
config = {
    # For testing with mock server
    "base_url": "http://localhost:4010",
    # For production
    # "base_url": "https://api.craftedclimate.com",
    
    # MOCK CREDENTIALS - Replace with your actual credentials
    "api_key": "cc_test_123456789",
    "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJ0ZXN0MTIzIn0.mock",
    "user_id": "test123"
}

def register_user() -> Dict[str, Any]:
    """Register a new user."""
    url = f"{config['base_url']}/api/auth/signup"
    
    # Prepare form data
    files = {
        'username': (None, 'testuser'),
        'email': (None, 'test@example.com'),
        'password': (None, 'securepass123'),
        'contact': (None, '233555123456')
    }
    
    try:
        response = requests.post(url, files=files)
        response.raise_for_status()
        print("Registration successful:", response.json())
        return response.json()
    except requests.exceptions.RequestException as e:
        print("Registration failed:", str(e))
        if hasattr(e.response, 'json'):
            print(e.response.json())
        raise

def send_telemetry(device_id: str = "device123") -> Dict[str, Any]:
    """Send telemetry data for a device."""
    url = f"{config['base_url']}/api/telemetry/env"
    
    # Prepare telemetry data
    data = {
        "i": device_id,
        "t": 25.4,  # temperature
        "h": 65,    # humidity
        "p": 1013.25  # pressure
    }
    
    headers = {
        "Content-Type": "application/json",
        "X-API-Key": config["api_key"]
    }
    
    try:
        response = requests.post(url, json=data, headers=headers)
        response.raise_for_status()
        print("Telemetry sent successfully:", response.json())
        return response.json()
    except requests.exceptions.RequestException as e:
        print("Failed to send telemetry:", str(e))
        if hasattr(e.response, 'json'):
            print(e.response.json())
        raise

def create_deployment() -> Dict[str, Any]:
    """Create a new deployment."""
    url = f"{config['base_url']}/api/devices/create-deployments"
    
    # Prepare deployment data
    data = {
        "userid": config["user_id"],
        "name": "Test Deployment",
        "description": "Test deployment created via Python example"
    }
    
    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {config['access_token']}"
    }
    
    try:
        response = requests.post(url, json=data, headers=headers)
        response.raise_for_status()
        print("Deployment created successfully:", response.json())
        return response.json()
    except requests.exceptions.RequestException as e:
        print("Failed to create deployment:", str(e))
        if hasattr(e.response, 'json'):
            print(e.response.json())
        raise

def main():
    """Run all examples."""
    print("Running CraftedClimate API Examples...\n")
    
    try:
        print("1. Registering user...")
        register_user()
        
        print("\n2. Sending telemetry...")
        send_telemetry()
        
        print("\n3. Creating deployment...")
        create_deployment()
        
        print("\nAll examples completed successfully!")
    except Exception as e:
        print("\nExample run failed:", str(e))

if __name__ == "__main__":
    main()