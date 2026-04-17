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
    # Force reload env
    from dotenv import load_dotenv
    load_dotenv()

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True) # Keep False for now to see it work
        context = await browser.new_context()
        page = await context.new_page()
        
        try:
            # 1. Navigate to Login
            api_key = os.getenv("ICICI_API_KEY")
            if not api_key:
                raise ValueError("ICICI_API_KEY is missing from .env")

            # Try the standard API endpoint if breezeapi is slow
            login_url = f"https://api.icicidirect.com/api/v2/login?api_key={api_key}"
            
            print(f"--- [DEBUG] Navigating to: {login_url} ---")
            await page.goto(login_url, wait_until="networkidle", timeout=60000)

            # 2. Safety Check: Take a screenshot if it fails
            try:
                await page.wait_for_selector("input#txtUserId", timeout=15000)
            except Exception:
                await page.screenshot(path="debug_login_error.png")
                print("--- [DEBUG] Selector not found. Saved screenshot to debug_login_error.png ---")
                raise ValueError("Login fields did not load. Check the screenshot!")
            
            # 3. Fill User ID and PIN
            user_id = os.getenv("ICICI_USER_ID")
            pin = os.getenv("ICICI_PASSWORD")
            
            if not user_id or not pin:
                raise ValueError(f"Missing Credentials! User: {user_id}, PIN: {'***' if pin else 'None'}")

            await page.fill("input#txtUserId", os.getenv("ICICI_USER_ID"))
            await page.fill("input#txtPassword", os.getenv("ICICI_PASSWORD"))
            await page.click("button#btnSubmit")
            
            # 4. Handle TOTP (2FA)
            totp_secret = os.getenv("ICICI_2FA_SECRET")
            if not totp_secret:
                raise ValueError("ICICI_2FA_SECRET (TOTP Key) is missing from .env")
                
            totp = pyotp.TOTP(totp_secret.replace(" ", "")) # Remove spaces if any
            
            await page.wait_for_selector("input#txtOTP", timeout=10000)
            await page.fill("input#txtOTP", totp.now())
            await page.click("button#btnVerify")
            
            # 4. Extract Token from Redirect URL
            # Note: Increased timeout as redirects can be slow
            await page.wait_for_url("**/apisession=**", timeout=45000)
            token = page.url.split("apisession=")[1].split("&")[0]
            
            # 5. Success Notification
            print(f"--- [AUTH] Token Extracted: {token[:5]}*** ---")
            send_telegram_msg(f"✅ ICICI Session Refreshed: {token[:5]}***")
            return token

        except Exception as e:
            print(f"DEBUG ERROR: {str(e)}")
            send_telegram_msg(f"❌ Autopilot Failed: {str(e)}")
            return None
        finally:
            await browser.close()