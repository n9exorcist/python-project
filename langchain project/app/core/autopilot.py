import os
import pyotp
import requests
import asyncio
from playwright.async_api import async_playwright
from dotenv import load_dotenv

def send_telegram_msg(message):
    try:
        token = os.getenv("TELEGRAM_BOT_TOKEN")
        chat_id = os.getenv("TELEGRAM_CHAT_ID")
        if not token or not chat_id:
            return
        url = f"https://api.telegram.org/bot{token}/sendMessage?chat_id={chat_id}&text={message}"
        requests.get(url, timeout=10) # Added timeout so it doesn't hang
    except Exception as e:
        print(f"Telegram notification failed: {e}")

async def get_breeze_token():
    # Force reload env ensures fresh keys are pulled every run
    load_dotenv()

    async with async_playwright() as p:
        # headless=False is best for debugging; change to True for Task Scheduler
        browser = await p.chromium.launch(headless=False) 
        context = await browser.new_context(
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        )
        page = await context.new_page()
        
        try:
            api_key = os.getenv("ICICI_API_KEY")
            if not api_key:
                raise ValueError("ICICI_API_KEY is missing from .env")

            # api.icicidirect.com is generally more stable than breezeapi for bots
            login_url = f"https://api.icicidirect.com/api/v2/login?api_key={api_key}"
            
            print(f"--- [DEBUG] Navigating to: {login_url} ---")
            # Using 'domcontentloaded' is faster and safer for corporate firewalls
            await page.goto(login_url, wait_until="domcontentloaded", timeout=60000)
            
            # Check for Zscaler interception
            if "blocked" in page.url.lower() or "zscaler" in page.url.lower():
                raise ValueError("Accenture/Zscaler Firewall detected. Switch to Mobile Hotspot.")

            # 2. Field Detection with Screenshot on failure
            try:
                await page.wait_for_selector("input#txtUserId", timeout=20000)
            except Exception:
                await page.screenshot(path="debug_login_error.png")
                raise ValueError("Login fields timed out. Check debug_login_error.png")
            
            # 3. Credentials
            user_id = os.getenv("ICICI_USER_ID")
            pin = os.getenv("ICICI_PASSWORD")
            
            if not user_id or not pin:
                raise ValueError("Missing ICICI_USER_ID or ICICI_PASSWORD in .env")

            await page.fill("input#txtUserId", user_id)
            await page.fill("input#txtPassword", pin)
            await page.click("button#btnSubmit")
            
            # 4. 2FA / TOTP
            totp_secret = os.getenv("ICICI_2FA_SECRET")
            if not totp_secret:
                raise ValueError("ICICI_2FA_SECRET (TOTP Key) is missing")
                
            totp = pyotp.TOTP(totp_secret.replace(" ", ""))
            
            await page.wait_for_selector("input#txtOTP", timeout=15000)
            await page.fill("input#txtOTP", totp.now())
            await page.click("button#btnVerify")
            
            # 5. Token Extraction
            await page.wait_for_url("**/apisession=**", timeout=45000)
            token = page.url.split("apisession=")[1].split("&")[0]
            
            print(f"--- [AUTH] Token Extracted: {token[:5]}*** ---")
            send_telegram_msg(f"✅ ICICI Session Refreshed: {token[:5]}***")
            return token

        except Exception as e:
            print(f"DEBUG ERROR: {str(e)}")
            send_telegram_msg(f"❌ Autopilot Failed: {str(e)}")
            return None
        finally:
            await browser.close()