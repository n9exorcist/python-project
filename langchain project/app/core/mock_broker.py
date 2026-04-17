from app.brokers.base import BaseBroker # <--- ADD THIS LINE
from app.db.database import db_session 
from app.brokers.icici_breeze import ICICIBreezeClient
from app.db.models import DummyTrade
from datetime import datetime

class MockBroker(BaseBroker):
    def __init__(self, db_session, breeze_client: ICICIBreezeClient):
        self.db = db_session
        self.breeze = breeze_client

    def get_nifty_price(self):
        # Delegate to the real ICICI client for live data
        return self.breeze.get_nifty_price()

    def place_order(self, symbol, action, quantity, price):
        """
        Implementation of the BaseBroker contract.
        In Mock mode, we redirect this to our dummy execution logic.
        """
        # We can extract the signal color from the action if needed, 
        # but usually, we call execute_dummy_trade directly from the agent.
        return self.execute_dummy_trade(action, datetime.now().strftime("%d-%m-%Y"))

    def execute_dummy_trade(self, signal, date_str):
        # 1. Fetch Real-time Nifty Spot (Corrected method name)
        spot_price = self.breeze.get_nifty_price()
        
        if not spot_price:
            return "Error: Could not fetch live Nifty price from ICICI."

        # 2. Strike Selection Logic (ATM Strike)
        strike = round(spot_price / 50) * 50
        
        # Mapping Green -> Sell Put, Red -> Sell Call
        trade_type = "SELL_PUT" if signal.lower() == "green" else "SELL_CALL"
        option_symbol = f"NIFTY_{strike}_{'PE' if signal.lower()=='green' else 'CE'}"
        
        # 3. Create Dummy Record
        # Ensure your DummyTrade model has a 'date' field to support the MCP tool!
        new_trade = DummyTrade(
            date=date_str, 
            symbol=option_symbol,
            entry_price=spot_price, 
            quantity=50,
            trade_type=trade_type
        )
        
        try:
            self.db.add(new_trade)
            self.db.commit()
            return f"Dummy Trade Logged: {trade_type} for {option_symbol} at {spot_price}"
        except Exception as e:
            self.db.rollback()
            return f"Database Error: {e}"