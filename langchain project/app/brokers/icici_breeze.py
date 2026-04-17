from breeze_connect import BreezeConnect
from .base import BaseBroker
import os

class ICICIBreezeClient(BaseBroker):
    def __init__(self):
        # Initializing the Breeze SDK
        self.breeze = BreezeConnect(api_key=os.getenv("ICICI_API_KEY"))
        
        # Session token must be updated in your .env daily before 9:15 AM
        try:
            self.breeze.generate_session(
                api_secret=os.getenv("ICICI_SECRET_KEY"),
                session_token=os.getenv("ICICI_SESSION_TOKEN")
            )
            print("--- [ICICI] Session Generated Successfully ---")
        except Exception as e:
            print(f"--- [ICICI] Session Failed: {e}. Check your SESSION_TOKEN in .env ---")

    def get_nifty_price(self) -> float:
        """Fetch Live Quote for Nifty 50 with corrected parameter names."""
        try:
            res = self.breeze.get_quotes(
                stock_code="NIFTY",
                exchange_code="NSE",
                expiry_date="",  # <--- CHANGED THIS from expiry_code to expiry_date
                product_type="cash",
                right="others",
                strike_price="0"
            )

            # Case-sensitive check for 'Status' and 'Success'
            if res.get('Status') == 200 or res.get('status') == 200:
                data = res.get('Success') or res.get('success')
                if data and len(data) > 0:
                    ltp = float(data[0]['ltp'])
                    print(f"--- [ICICI] Successfully fetched Nifty LTP: {ltp} ---")
                    return ltp

            print(f"--- [ICICI] API responded but keys mismatched: {res} ---")
        except Exception as e:
            print(f"--- [ICICI] Price Fetch Error: {e} ---")
        return 0.0

    def place_order(self, symbol, action, quantity, price):
        """
        Placeholder for live execution. 
        In your current 'Market Analyst Pro' flow, we use MockBroker, 
        but this must exist to satisfy BaseBroker.
        """
        print(f"--- [ICICI] Live Order Blocked (Mock Mode Active): {action} {symbol} @ {price} ---")
        # To go live, you'd call: self.breeze.place_order(...)
        pass