import yfinance as yf
import pandas as pd
import numpy as np

# --- Insert signals for July ---
july_signals = [
    ['01-07-2025', 'Green', None],
    ['02-07-2025', 'Green', None],
    ['03-07-2025', 'Red', None],
    ['04-07-2025', 'Red', None],
    ['07-07-2025', 'Red', None],
    ['08-07-2025', 'Red', None],
    ['09-07-2025', 'Red', None],
    ['10-07-2025', 'Red', None],
    ['11-07-2025', 'Red', None],
    ['14-07-2025', 'Green', None],
    ['15-07-2025', 'Red', None],
    ['16-07-2025', 'Red', None],
    ['17-07-2025', 'Red', None],
    ['18-07-2025', 'Red', None],
    ['21-07-2025', 'Red', None],
    ['22-07-2025', 'Red', None],
    ['23-07-2025', 'Red', None],
    ['24-07-2025', 'Red', None],
    ['25-07-2025', 'Red', None],
    ['28-07-2025', 'Red', None],
    ['29-07-2025', 'Green', None],
    ['30-07-2025', 'Red', None],
    ['31-07-2025', 'Red', None],
]

# --- Insert signals for August ---
august_signals = [
    ['01-08-2025', 'Green', 'Red'],
    ['04-08-2025', 'Red', 'Green'],
    ['05-08-2025', 'Red', 'Green'],
    ['06-08-2025', 'Green', 'Green'],
    ['07-08-2025', 'Red', 'Red'],
    ['08-08-2025', 'Green', 'Green'],
    ['11-08-2025', 'Red', 'Green'],
    ['12-08-2025', 'Red', 'Green'],
    ['13-08-2025', 'Green', 'Green'],
    ['14-08-2025', 'Red', 'Red'],
    ['15-08-2025', 'Red', 'Green'],
    ['18-08-2025', 'Red', 'Red'],
    ['19-08-2025', 'Red', 'Red'],
    ['20-08-2025', 'Green', 'Green'],
    ['21-08-2025', 'Green', 'Green'],
    ['22-08-2025', 'Red', 'Red'],
    ['25-08-2025', 'Green', 'Red'],
    ['26-08-2025', 'Red', 'Red'],
    ['27-08-2025', 'Green', 'Green'],
    ['28-08-2025', 'Red', 'Red'],
    ['29-08-2025', 'Green', 'Red'],
]

# --- Add signals for September Strategy 2.1 ---
september_signals = [
    ['01-09-2025', None, 'Green'],
    ['02-09-2025', None, 'Green'],
    ['03-09-2025', None, 'Green'],
    ['04-09-2025', None, 'Green'],
    ['05-09-2025', None, 'Green'],
    ['08-09-2025', None, 'Red'],
    ['09-09-2025', None, 'Red'],
    ['10-09-2025', None, 'Red'],
    ['11-09-2025', None, 'Red'],
    ['12-09-2025', None, 'Red'],
    ['15-09-2025', None, 'Green'],
    ['16-09-2025', None, 'Red'],
    ['17-09-2025', None, 'Green'],
    ['18-09-2025', None, 'Green'],
    ['19-09-2025', None, 'Green'],
    ['22-09-2025', None, 'Red'],
    ['23-09-2025', None, 'Red'],
    ['24-09-2025', None, 'Red'],
    ['25-09-2025', None, 'Red'],
    ['26-09-2025', None, 'Red'],
    ['29-09-2025', None, 'Green'],
    ['30-09-2025', None, 'Green'],
]

# --- Insert signals for October ---
october_signals = [
    ['01-10-2025', None, 'Red'],
    ['02-10-2025', None, 'Green'],
    ['03-10-2025', None, 'Green'],
    ['06-10-2025', None, 'Red'],
    ['07-10-2025', None, 'Red'],
    ['08-10-2025', None, 'Red'],
    ['09-10-2025', None, 'Red'],
    ['10-10-2025', None, 'Red'],
    ['13-10-2025', None, 'Green'],
    ['14-10-2025', None, 'Green'],
    ['15-10-2025', None, 'Green'],
    ['16-10-2025', None, 'Red'],
    ['17-10-2025', None, 'Red'],
    ['20-10-2025', None, 'Red'],
    ['21-10-2025', None, 'Green'],
    ['22-10-2025', None, 'Red'],
    ['23-10-2025', None, 'Red'],
    ['24-10-2025', None, 'Red'],
    ['27-10-2025', None, 'Red'],
    ['28-10-2025', None, 'Red'],
    ['29-10-2025', None, 'Green'],
    ['30-10-2025', None, 'Red'],
    ['31-10-2025', None, 'Red'],
]

# --- Insert signals for November (Strategy 2.1 only, Strategy 1 = None) ---
november_signals = [
    ['03-11-2025', None, 'Red'],
    ['04-11-2025', None, 'Red'],
    ['05-11-2025', None, 'Green'],
    ['06-11-2025', None, 'Green'],
    ['07-11-2025', None, 'Red'],
    ['10-11-2025', None, 'Red'],
    ['11-11-2025', None, 'Red'],
    ['12-11-2025', None, 'Red'],
    ['13-11-2025', None, 'Green'],
    ['14-11-2025', None, 'Red'],
    ['17-11-2025', None, 'Red'],
    ['18-11-2025', None, 'Red'],
    ['19-11-2025', None, 'Green'],
    ['20-11-2025', None, 'Red'],
    ['21-11-2025', None, 'Red'],
    ['24-11-2025', None, 'Red'],
    ['25-11-2025', None, 'Green'],
    ['26-11-2025', None, 'Green'],
    ['27-11-2025', None, 'Green'],
    ['28-11-2025', None, 'Green'],
]

december_signals = [
    ['01-12-2025', None, 'Green'],
    ['02-12-2025', None, 'Red'],
    ['03-12-2025', None, 'Red'],
    ['04-12-2025', None, 'Red'],
    ['05-12-2025', None, 'Green'],
    ['08-12-2025', None, 'Green'],
    ['09-12-2025', None, 'Red'],
    ['10-12-2025', None, 'Red'],
    ['11-12-2025', None, 'Red'],
    ['12-12-2025', None, 'Red'],
    ['15-12-2025', None, 'Red'],
    ['16-12-2025', None, 'Red'],
    ['17-12-2025', None, 'Red'],
    ['18-12-2025', None, 'Red'],
    ['19-12-2025', None, 'Green'],
    ['22-12-2025', None, 'Red'],
    ['23-12-2025', None, 'Red'],
    ['24-12-2025', None, 'Red'],
    ['25-12-2025', None, 'Green'],
    ['26-12-2025', None, 'Green'],
    ['29-12-2025', None, 'Green'],
    ['30-12-2025', None, 'Green'],
    ['31-12-2025', None, 'Green'],
]

# --- Insert signals for January 2026 (Strategy 2.1 only, Strategy 1 = None) ---
january_signals = [
    ['01-01-2026', None, 'Green'],
    ['02-01-2026', None, 'Green'],
    ['05-01-2026', None, 'Green'],
    ['06-01-2026', None, 'Green'],
    ['07-01-2026', None, 'Green'],
    ['08-01-2026', None, 'Green'],
    ['09-01-2026', None, None],      # NoTrade
    ['12-01-2026', None, 'Red'],
    ['13-01-2026', None, 'Red'],
    ['14-01-2026', None, 'Red'],
    ['15-01-2026', None, 'Green'],
    ['16-01-2026', None, 'Red'],
    ['19-01-2026', None, 'Green'],
    ['20-01-2026', None, 'Red'],
    ['21-01-2026', None, 'Green'],
    ['22-01-2026', None, 'Red'],
    ['23-01-2026', None, 'Green'],
    ['26-01-2026', None, 'Red'],
    ['27-01-2026', None, 'Green'],
    ['28-01-2026', None, None],      # NoTrade
    ['29-01-2026', None, None],      # NoTrade
    ['30-01-2026', None, None],      # NoTrade
]

# --- Insert signals for February 2026 (Strategy 2.1 only, Strategy 1 = None) ---
february_signals = [
    ['02-02-2026', None, 'Red'],
    ['03-02-2026', None, 'Red'],
    ['04-02-2026', None, 'Red'],
    ['05-02-2026', None, 'Red'],
    ['06-02-2026', None, 'Red'],
    ['09-02-2026', None, 'Green'],
    ['10-02-2026', None, 'Green'],
    ['11-02-2026', None, 'Green'],
    ['12-02-2026', None, 'Red'],
    ['13-02-2026', None, 'Green'],
    ['16-02-2026', None, 'Red'],
    ['17-02-2026', None, 'Green'],
    ['18-02-2026', None, 'Green'],
    ['19-02-2026', None, 'Green'],
    ['20-02-2026', None, 'Red'],
    ['23-02-2026', None, 'Green'],
    ['24-02-2026', None, 'Green'],
    ['25-02-2026', None, 'Red'],
    ['26-02-2026', None, 'Red'],
    ['27-02-2026', None, 'Red'],
]

# --- Combine all signals ---
all_signals = (
    july_signals
    + august_signals
    + september_signals
    + october_signals
    + november_signals
    + december_signals
    + january_signals
    + february_signals
)

strategy_df = pd.DataFrame(all_signals, columns=['Date', 'Strategy 1', 'Strategy 2.1'])
strategy_df['Date'] = pd.to_datetime(strategy_df['Date'], format='%d-%m-%Y', dayfirst=True)

# --- Fetch Nifty 50 historical data from Yahoo Finance ---
nifty_symbol = '^NSEI'
nifty_data = yf.download(
    nifty_symbol,
    start='2025-07-01',   # or earlier if you want buffer
    end=None,
    interval='1d',
    auto_adjust=False
)

nifty_data = nifty_data.reset_index()
if isinstance(nifty_data.columns, pd.MultiIndex):
    nifty_data.columns = nifty_data.columns.get_level_values(0)
nifty_open_close = nifty_data[['Date', 'Open', 'Close']].copy()
nifty_open_close['Date'] = pd.to_datetime(nifty_open_close['Date'])
strategy_df = strategy_df.reset_index(drop=True)

merged_df = pd.merge(strategy_df, nifty_open_close, on='Date', how='left')
merged_df = merged_df.dropna(subset=['Open', 'Close'])

def calc_pnl(signal, open_, close_):
    if signal == 'Green':
        return close_ - open_
    elif signal == 'Red':
        return open_ - close_
    else:
        return 0.0

merged_df['PnL_Strategy1'] = merged_df.apply(
    lambda x: calc_pnl(x['Strategy 1'], x['Open'], x['Close']),
    axis=1
)
merged_df['PnL_Strategy2.1'] = merged_df.apply(
    lambda x: calc_pnl(x['Strategy 2.1'], x['Open'], x['Close']),
    axis=1
)
merged_df['Month'] = merged_df['Date'].dt.to_period('M')
merged_df['MonthStr'] = merged_df['Month'].dt.strftime('%B %Y')

monthly_pnl_strategy1 = merged_df.groupby('Month')['PnL_Strategy1'].sum().reset_index()
monthly_pnl_strategy2 = merged_df.groupby('Month')['PnL_Strategy2.1'].sum().reset_index()

print(merged_df[['Date', 'Open', 'Close', 'Strategy 1', 'Strategy 2.1', 'PnL_Strategy1', 'PnL_Strategy2.1']])
print("\nMonthly P&L for Strategy 1:")
print(monthly_pnl_strategy1)
print("\nMonthly P&L for Strategy 2.1:")
print(monthly_pnl_strategy2)
print(f"\nCumulative P&L for Strategy 1: {merged_df['PnL_Strategy1'].sum():.2f}")
print(f"Cumulative P&L for Strategy 2.1: {merged_df['PnL_Strategy2.1'].sum():.2f}")

most_recent_period = merged_df['Month'].max()
most_recent_month = most_recent_period.strftime('%B %Y')

# --- Options and Futures Strategies ---
lot_size = 75  # Standard Nifty lot size

# Dynamic monthly expiry logic for NIFTY futures symbol
def last_tuesday(year, month):
    last_day = pd.Timestamp(year=year, month=month, day=1) + pd.offsets.MonthEnd()
    offset = (last_day.weekday() - 1) % 7
    return last_day - pd.Timedelta(days=offset)

def generate_expiry_map(dates):
    months = sorted({(d.year, d.month) for d in dates})
    expiry_map = {}
    for year, month in months:
        expiry = last_tuesday(year, month)
        symbol = f"NIFTY {expiry.strftime('%d%b%y').upper()} FUT"
        expiry_map[expiry] = symbol
    return expiry_map

def select_future_symbol_dynamic(date, expiry_map):
    expiries = sorted(expiry_map.keys())
    for exp in expiries:
        if date <= exp:
            return expiry_map[exp]
    if expiries:
        next_expiry = expiries[-1] + pd.DateOffset(months=1)
        return f"NIFTY {next_expiry.strftime('%d%b%y').upper()} FUT"
    return None

expiry_map = generate_expiry_map(merged_df['Date'])
merged_df['Future_Symbol'] = merged_df['Date'].apply(lambda x: select_future_symbol_dynamic(x, expiry_map))
merged_df['Future_Action'] = merged_df['Strategy 2.1'].map({'Green': 'Buy', 'Red': 'Sell'})

def get_nearest_weekly_expiry(date):
    days_ahead = 1 - date.weekday()  # Tuesday = 1
    if days_ahead <= 0:
        days_ahead += 7
    return date + pd.Timedelta(days=days_ahead)

def calculate_strike(open_price, signal):
    if pd.isna(open_price):
        return np.nan
    base_strike = round(open_price / 500) * 500
    if signal == 'Green':
        strike = base_strike - 500
    elif signal == 'Red':
        strike = base_strike + 500
    else:
        strike = np.nan
    return strike

merged_df['Option_Strike'] = merged_df.apply(
    lambda x: calculate_strike(x['Open'], x['Strategy 2.1']),
    axis=1
)
merged_df['Next_Weekly_Expiry'] = merged_df['Date'].apply(get_nearest_weekly_expiry)

def generate_option_symbol(row):
    signal = row['Strategy 2.1']
    if pd.isna(row['Option_Strike']) or signal is None:
        return None
    expiry_date = row['Next_Weekly_Expiry'].day
    month_str = row['Next_Weekly_Expiry'].strftime('%b').upper()
    strike = int(row['Option_Strike'])
    option_type = 'CE' if signal == 'Green' else 'PE'
    week_number = ((expiry_date - 1) // 7) + 1
    week_suffix = {1: '1st', 2: '2nd', 3: '3rd', 4: '4th', 5: '5th'}.get(week_number, f'{week_number}th')
    return f"NIFTY {week_suffix}(W) {month_str} {strike} {option_type} - Buy"

merged_df['Option_Symbol'] = merged_df.apply(generate_option_symbol, axis=1)

delta = 0.6
merged_df['Option_PnL'] = np.where(
    merged_df['Strategy 2.1'].notna(),
    (merged_df['Close'] - merged_df['Open']) * delta * lot_size * np.where(merged_df['Strategy 2.1'] == 'Green', 1, -1),
    0.0
)
merged_df['Futures_PnL'] = np.where(
    merged_df['Future_Action'] == 'Buy',
    (merged_df['Close'] - merged_df['Open']) * lot_size,
    np.where(
        merged_df['Future_Action'] == 'Sell',
        (merged_df['Open'] - merged_df['Close']) * lot_size,
        0.0
    )
)

# Only now filter for the recent month
recent_month_data = merged_df[merged_df['MonthStr'] == most_recent_month]
recent_options_pnl = recent_month_data['Option_PnL'].sum()
recent_futures_pnl = recent_month_data['Futures_PnL'].sum()

monthly_options_pnl = merged_df.groupby('Month')['Option_PnL'].sum().reset_index()
monthly_futures_pnl = merged_df.groupby('Month')['Futures_PnL'].sum().reset_index()
cumulative_options_pnl = merged_df['Option_PnL'].sum()
cumulative_futures_pnl = merged_df['Futures_PnL'].sum()

print("-------------------------------------Options & Futures------------------------------------")
print("Daily Data with Options and Futures PnL:")
print(merged_df[['Date', 'Strategy 2.1', 'Option_Symbol', 'Future_Action', 'Future_Symbol', 'Open', 'Close', 'Option_PnL', 'Futures_PnL']])
print("\nMonthly P&L for Options Strategy:")
print(monthly_options_pnl)
print("\nMonthly P&L for Futures Strategy:")
print(monthly_futures_pnl)
print(f"\nCumulative P&L for Options Strategy: {cumulative_options_pnl:.2f}")
print(f"Cumulative P&L for Futures Strategy: {cumulative_futures_pnl:.2f}")
print(f"\nCumulative P&L for Current month ({most_recent_month}) - Options Strategy: {recent_options_pnl:.2f}")
print(f"Cumulative P&L for Current month ({most_recent_month}) - Futures Strategy: {recent_futures_pnl:.2f}")