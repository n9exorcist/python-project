import os
import asyncio
import base64
import requests
from nacl import encoding, public
from dotenv import load_dotenv
from app.core.autopilot import get_breeze_token

load_dotenv()

# --- CONFIGURATION ---
GH_PAT = os.getenv("GITHUB_PAT") # Your new Fine-grained token
REPO_NAME = "n9exorcist/python-project"
SECRET_NAME = "ICICI_SESSION_TOKEN"

def encrypt_secret(public_key: str, secret_value: str) -> str:
    """GitHub requires secrets to be encrypted with their public key before sending."""
    public_key = public.PublicKey(public_key.encode("utf-8"), encoding.Base64Encoder)
    sealed_box = public.SealedBox(public_key)
    encrypted = sealed_box.encrypt(secret_value.encode("utf-8"))
    return base64.b64encode(encrypted).decode("utf-8")

async def update_github_secret():
    # 1. Get the Token locally (Indian IP)
    print("--- [BRIDGE] Generating ICICI Token locally... ---")
    session_token = await get_breeze_token()
    
    if not session_token:
        print("❌ Failed to get token locally.")
        return

    # 2. Get GitHub Repo Public Key
    headers = {"Authorization": f"Bearer {GH_PAT}", "Accept": "application/vnd.github+json"}
    url = f"https://api.github.com/repos/{REPO_NAME}/actions/secrets/public-key"
    key_data = requests.get(url, headers=headers).json()
    
    # 3. Encrypt and Upload
    encrypted_value = encrypt_secret(key_data["key"], session_token)
    secret_url = f"https://api.github.com/repos/{REPO_NAME}/actions/secrets/{SECRET_NAME}"
    
    response = requests.put(
        secret_url,
        headers=headers,
        json={"encrypted_value": encrypted_value, "key_id": key_data["key_id"]}
    )

    if response.status_code in [201, 204]:
        print(f"✅ SUCCESS: {SECRET_NAME} updated on GitHub!")
    else:
        print(f"❌ FAILED: {response.text}")

if __name__ == "__main__":
    asyncio.run(update_github_secret())