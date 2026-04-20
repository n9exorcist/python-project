import os
import asyncio
import base64
import requests
from nacl import encoding, public
from dotenv import load_dotenv, find_dotenv
from app.core.autopilot import get_breeze_token, send_telegram_msg

# Explicitly find and load the .env file
load_dotenv(find_dotenv())

# --- CONFIGURATION ---
GH_PAT = os.getenv("GITHUB_PAT") 
REPO_NAME = "n9exorcist/python-project"
SECRET_NAME = "ICICI_SESSION_TOKEN"

def encrypt_secret(public_key: str, secret_value: str) -> str:
    """GitHub requires secrets to be encrypted with their public key."""
    public_key_obj = public.PublicKey(public_key.encode("utf-8"), encoding.Base64Encoder)
    sealed_box = public.SealedBox(public_key_obj)
    encrypted = sealed_box.encrypt(secret_value.encode("utf-8"))
    return base64.b64encode(encrypted).decode("utf-8")

async def update_github_secret():
    print("--- [BRIDGE] Starting Morning Handshake... ---")
    
    # 1. Get the Token locally
    session_token = await get_breeze_token()
    
    if not session_token:
        error_msg = "❌ BRIDGE FAILURE: Check automation_failure.png"
        print(error_msg)
        send_telegram_msg(error_msg)
        return

    try:
        # 2. Get GitHub Repo Public Key
        headers = {
            "Authorization": f"Bearer {GH_PAT}", 
            "Accept": "application/vnd.github+json"
        }
        url = f"https://api.github.com/repos/{REPO_NAME}/actions/secrets/public-key"
        
        response_key = requests.get(url, headers=headers)
        response_key.raise_for_status()
        key_data = response_key.json()
        
        # 3. Encrypt and Upload
        encrypted_value = encrypt_secret(key_data["key"], session_token)
        secret_url = f"https://api.github.com/repos/{REPO_NAME}/actions/secrets/{SECRET_NAME}"
        
        response_put = requests.put(
            secret_url,
            headers=headers,
            json={"encrypted_value": encrypted_value, "key_id": key_data["key_id"]}
        )

        if response_put.status_code in [201, 204]:
            success_msg = f"✅ BRIDGE SUCCESS: GitHub Updated for {REPO_NAME}"
            print(success_msg)
            send_telegram_msg(success_msg)
        else:
            fail_msg = f"❌ BRIDGE ERROR: GitHub Rejected Update: {response_put.text}"
            print(fail_msg)
            send_telegram_msg(fail_msg)

    except Exception as e:
        err_msg = f"⚠️ BRIDGE CRITICAL: {str(e)}"
        print(err_msg)
        send_telegram_msg(err_msg)

if __name__ == "__main__":
    asyncio.run(update_github_secret())