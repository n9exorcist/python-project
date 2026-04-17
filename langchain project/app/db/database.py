import os
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, scoped_session
from sqlalchemy.ext.declarative import declarative_base

# 1. Path Handling
DB_PATH = os.path.join(os.path.dirname(__file__), "memory.db")
DATABASE_URL = f"sqlite:///{DB_PATH}"

# 2. SQLAlchemy Setup
engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
db_session = scoped_session(sessionmaker(autocommit=False, autoflush=False, bind=engine))

Base = declarative_base()

# 3. The missing function main.py is looking for:
def init_db():
    import app.db.models  # This ensures models are loaded before creating tables
    Base.metadata.create_all(bind=engine)
    print(f"--- [DB] Tables Created Successfully at {DB_PATH} ---")