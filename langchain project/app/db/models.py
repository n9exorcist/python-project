from sqlalchemy import Column, Integer, String, Float, DateTime, Boolean
import datetime
from app.db.database import Base # <--- IMPORT THE ONE FROM DATABASE.PY

class DailySignal(Base):
    __tablename__ = "daily_signals"
    id = Column(Integer, primary_key=True)
    date = Column(String, unique=True)  # Format: DD-MM-YYYY
    signal = Column(String)             # Green, Red, or None
    status = Column(String, default="Pending") # Pending, Executed, Skipped

class DummyTrade(Base):
    __tablename__ = "dummy_trades"
    id = Column(Integer, primary_key=True)
    # --- ADD THIS COLUMN ---
    date = Column(String, index=True)   # Crucial for MCP tool lookup (e.g., "20-04-2026")
    # -----------------------
    symbol = Column(String)             # e.g., NIFTY24300PE
    entry_price = Column(Float)
    exit_price = Column(Float, nullable=True)
    quantity = Column(Integer, default=50) # Standard Nifty lot size
    trade_type = Column(String)         # SELL_PUT, SELL_CALL
    # Use func.now() or timezone-aware objects if possible
    timestamp = Column(DateTime, default=datetime.datetime.now) 
    pnl = Column(Float, default=0.0)
    is_closed = Column(Boolean, default=False)