from datetime import datetime

class StrategyService:
    def __init__(self, mock_broker, breeze_client):
        self.broker = mock_broker
        self.breeze = breeze_client

    def execute_logic(self, signal):
        """
        The core automation logic triggered at 9:15 AM.
        """
        if not signal or signal.strip() == "":
            return "Strategy skipped: No Signal provided."

        # 1. Fetch live Nifty Spot via ICICI Breeze
        # We use the method name we standardized in icici_breeze.py
        nifty_spot = self.breeze.get_nifty_price() 
        
        if not nifty_spot or nifty_spot == 0.0:
            return "Strategy failed: Could not retrieve live Nifty price."
        
        # 2. Capture the date for the database record
        today_str = datetime.now().strftime("%d-%m-%Y")
        
        # 3. Call Mock Broker for Dummy Entry
        # Note: We align the arguments with your MockBroker implementation
        try:
            result = self.broker.execute_dummy_trade(
                signal=signal, 
                date_str=today_str
            )
            return f"Strategy Executed: {result}"
        except Exception as e:
            return f"Strategy Execution Error: {e}"