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
        requests.get(url, timeout=10)
    except Exception as e:
        print(f"Telegram notification failed: {e}")

async def get_breeze_token():
    load_dotenv()
    async with async_playwright() as p:
        # Launching with a window position off-screen (-2000) 
        # keeps it 'headed' to bypass bot checks but invisible to you.
        browser = await p.chromium.launch(
            headless=False, 
            args=['--window-position=-2000,-2000', '--disable-blink-features=AutomationControlled']
        ) 
        
        context = await browser.new_context(
            viewport={'width': 1920, 'height': 1080},
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36"
        )
        page = await context.new_page()
        
        # MANUAL STEALTH: This is the most stable way to hide the 'bot' flag
        await page.add_init_script("Object.defineProperty(navigator, 'webdriver', {get: () => undefined})")
        
        try:
            api_key = os.getenv("ICICI_API_KEY")
            login_url = f"https://api.icicidirect.com/api/v2/login?api_key={api_key}"
            
            print(f"--- [STEALTH] Navigating to ICICI ---")
            await page.goto(login_url, wait_until="domcontentloaded", timeout=60000)

            # Wait for JS to settle
            await asyncio.sleep(5) 

            # Check for immediate block
            if "Bad Request" in await page.content():
                raise ValueError("ICICI detected the session. Switch to Mobile Hotspot and try again.")

            # 1. Credentials
            await page.wait_for_selector("input#txtUserId", state="visible", timeout=30000)
            print("--- [AUTO] Entering Credentials ---")
            await page.type("input#txtUserId", os.getenv("ICICI_USER_ID"), delay=150)
            await page.type("input#txtPassword", os.getenv("ICICI_PASSWORD"), delay=150)
            await page.click("button#btnSubmit")
            
            # 2. 2FA / TOTP
            print("--- [AUTO] Generating & Entering TOTP ---")
            totp_secret = os.getenv("ICICI_2FA_SECRET").replace(" ", "")
            totp = pyotp.TOTP(totp_secret)
            
            await page.wait_for_selector("input#txtOTP", state="visible", timeout=20000)
            await page.type("input#txtOTP", totp.now(), delay=150)
            await page.click("button#btnVerify")
            
            # 3. Capture Token
            await page.wait_for_url("**/apisession=**", timeout=60000)
            token = page.url.split("apisession=")[1].split("&")[0]
            
            print(f"--- [SUCCESS] Stealth Token captured! ---")
            return token

        except Exception as e:
            await page.screenshot(path="automation_failure.png")
            print(f"DEBUG ERROR: {str(e)}")
            return None
        finally:
            await browser.close()