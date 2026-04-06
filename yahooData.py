import yfinance as yf
import pandas as pd

# Define the Nifty 50 symbol used by Yahoo Finance
nifty_symbol = '^NSEI'

# Fetch historical daily OHLC data for past 3 months
nifty_data = yf.download(nifty_symbol, period='2mo', interval='1d')

# Only keep 'Open' and 'Close' columns
nifty_open_close = nifty_data[['Open', 'Close']]

# Display the data
print(nifty_open_close)
