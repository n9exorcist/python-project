import os
import pandas as pd
from datetime import datetime

class SignalService:
    def __init__(self, csv_path=None):
        if csv_path is None:
            # Safer way: Look for the 'data' folder in several likely locations
            # This handles both running from /langchain project/ or the root /python project/
            possible_paths = [
                os.path.join(os.getcwd(), "data", "signals.csv"),
                os.path.join(os.getcwd(), "..", "data", "signals.csv"),
                os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "..", "data", "signals.csv"))
            ]
            self.csv_path = next((p for p in possible_paths if os.path.exists(p)), possible_paths[0])
        else:
            self.csv_path = csv_path

    def get_today_signal(self):
        # Using %d-%m-%Y is correct for your 17-04-2026 format
        today_str = datetime.now().strftime("%d-%m-%Y")
        
        try:
            if not os.path.exists(self.csv_path):
                print(f"--- [ERROR] signals.csv not found at {self.csv_path} ---")
                return None

            df = pd.read_csv(self.csv_path)
            
            # Clean columns to prevent "KeyError"
            df.columns = [c.strip() for c in df.columns]
            df['Date'] = df['Date'].astype(str).str.strip()
            
            row = df[df['Date'] == today_str]
            
            if not row.empty:
                # Use .strip() to ensure "Green " matches "Green"
                signal = str(row.iloc[0]['Candle']).strip()
                
                # IMPORTANT: Return the exact string your trading_node expects
                if signal in ["Green", "Red"]:
                    print(f"--- [SIGNAL] Date: {today_str} | Found: {signal} ---")
                    return signal
                
                print(f"--- [SIGNAL] Date: {today_str} | Neutral Signal: {signal} ---")
                return None
            
            return None
            
        except Exception as e:
            print(f"--- [ERROR] Signal Service: {e} ---")
            return None