import os
import sys

# Get the absolute path of the 'langchain project' directory
root_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if root_dir not in sys.path:
    sys.path.append(root_dir)

# Now Python can find 'app.brokers...'
from app.brokers.icici_breeze import ICICIBreezeClient
from dotenv import load_dotenv

load_dotenv()

# app/brokers/test_connection.py
try:
    client = ICICIBreezeClient()
    # Let's check the raw response
    res = client.breeze.get_quotes(
        stock_code="NIFTY",
        exchange_code="NSE",
        product_type="cash"
    )
    print(f"RAW RESPONSE: {res}") 
    
    # Check for 'Success' (Capital S)
    if res and res.get('Success') and len(res['Success']) > 0:
        price = res['Success'][0]['ltp']
        print(f"Successfully connected! Current Nifty Price: {price}")
    else:
        error_msg = res.get('Error') or "No data in Success list"
        print(f"Connected, but no price data: {error_msg}")
except Exception as e:
    print(f"Connection failed: {e}")