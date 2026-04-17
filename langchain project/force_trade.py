# force_trade.py
import sqlite3
from datetime import datetime

db_path = "memory.db" # Adjust path if it's in app/db/
conn = sqlite3.connect(db_path)
cursor = conn.cursor()

# Ensure the table exists
cursor.execute("""
    CREATE TABLE IF NOT EXISTS dummy_trades (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        date TEXT,
        signal TEXT,
        price REAL,
        action TEXT
    )
""")

# Insert today's data (April 17, 2026)
today = datetime.now().strftime("%d-%m-%Y")
cursor.execute("INSERT INTO dummy_trades (date, signal, price, action) VALUES (?, ?, ?, ?)", 
               (today, 'Green', 24279.0, 'Sell Put'))

conn.commit()
conn.close()
print(f"Successfully inserted dummy trade for {today} into {db_path}")