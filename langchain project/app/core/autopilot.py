import os
import pyotp
import requests
import asyncio
from playwright.async_api import async_playwright
from dotenv import load_dotenv

load_dotenv()

def send_telegram_msg(message):
    token = os.getenv("TELEGRAM_BOT_TOKEN")
    chat_id = os.getenv("TELEGRAM_CHAT_ID")
    url = f"https://api.telegram.org/bot{token}/sendMessage?chat_id={chat_id}&text={message}"
    requests.get(url)

async def get_breeze_token():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        # Using a context is better for managing cookies/state
        context = await browser.new_context()
        page = await context.new_page()
        
        try:
            # 1. Navigate to Login
            api_key = os.getenv("ICICI_API_KEY")
            login_url = f"https://breezeapi.icicidirect.com/api/v2/login?api_key={api_key}"
            await page.goto(login_url)
            
            # 2. Fill User ID and PIN (Mapping ICICI_PASSWORD secret to the PIN field)
            await page.fill("input#txtUserId", os.getenv("ICICI_USER_ID"))
            await page.fill("input#txtPassword", os.getenv("ICICI_PASSWORD"))
            await page.click("button#btnSubmit")
            
            # 3. Handle TOTP (2FA)
            totp = pyotp.TOTP(os.getenv("ICICI_2FA_SECRET"))
            await page.wait_for_selector("input#txtOTP", timeout=10000)
            await page.fill("input#txtOTP", totp.now())
            await page.click("button#btnVerify")
            
            # 4. Extract Token from Redirect URL
            await page.wait_for_url("**/apisession=**", timeout=30000)
            token = page.url.split("apisession=")[1].split("&")[0]
            
            # 5. Success Notification
            send_telegram_msg(f"✅ ICICI Session Refreshed: {token[:5]}***")
            return token

        except Exception as e:
            # Failure Notification
            send_telegram_msg(f"❌ Autopilot Failed: {str(e)}")
            return None
        finally:
            await browser.close()