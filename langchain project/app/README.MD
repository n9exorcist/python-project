Market Analyst Pro: AI-Driven Astrological Trading Engine
Market Analyst Pro is a sophisticated, end-to-end automated trading and analysis system. It bridges the gap between financial astrology (Nakshatras and planetary transits) and modern algorithmic execution. By leveraging LangGraph for AI orchestration, MCP for localized data toolsets, and ICICI Breeze for real-time market data, it automates the "Analysis-to-Execution" pipeline.

🏗️ System Architecture
The system operates on two parallel tracks: Automated Execution (9:16 AM) and Interactive AI Insights (User Chat).

1. The Automated Journey (9:16 AM IST)
   Trigger: APScheduler fires the daily_trade_job.

Signal: SignalService retrieves the day's bias (Green/Red) from signals.csv.

Strategy: StrategyService fetches Nifty LTP via ICICI_Breeze, calculates ATM strikes, and determines the trade type.

Execution: MockBroker logs the trade into the SQLite persistence layer.

2. The AI Agent Journey
   Orchestration: A LangGraph state machine handles multi-turn reasoning.

Routing: The agent dynamically routes queries between Local Records (SQLite/CSV), Vector Knowledge (FAISS), or Web Search.

Tools: Integration via MCP (Model Context Protocol) over SSE.

📂 Project Structure & Component Roles
app/
agents/trading_agent.py: The "Intelligence." Defines LangGraph nodes and decision-making logic for tool usage.

brokers/:

base.py: Abstract contract for all brokers.

icici_breeze.py: Live market pipe for quotes and session management.

core/:

strategy_service.py: The "Decision Maker" applying astrological rules to price data.

signal_service.py: Interface for reading proprietary CSV signals.

mock_broker.py: The "Accountant." Logs virtual trades to memory.db for performance tracking.

db/:

database.py: Manages SQLAlchemy engine and sessions.

models.py: SQLAlchemy blueprints for DummyTrade and DailySignal.

memory.db: Centralized SQLite storage for trades and conversation history.

⚙️ Setup & Installation

1. Environment Variables
   Create a .env file in the root directory:

Code snippet
GROQ_API_KEY=your_groq_key
ICICI_API_KEY=your_api_key
ICICI_SECRET_KEY=your_secret_key
ICICI_SESSION_TOKEN=updated_daily_token 2. Database Initialization
The database initializes automatically.

Note: If you modify models.py, you must delete app/db/memory.db to force a schema refresh.

🏃 Running the Project
Open three separate terminals and run the following in order:

Step 1: Start the MCP Server
Handles the local data tools (CSV lookup, DB queries).

Bash
fastmcp run mcp_server.py --transport sse --host 127.0.0.1 --port 9001
Step 2: Start the Backend (FastAPI)
Triggers the 9:16 AM scheduler and hosts the AI Graph.

Bash
uvicorn main:app --host 127.0.0.1 --port 8001 --reload
Step 3: Start the Frontend (React)
The professional dashboard for analysis.

Bash
cd frontend/frontend
npm start
📈 Daily Workflow & Flow Diagram
Integrated Data Flow
Generate Token: Daily 9:00 AM login to ICICI Breeze to update ICICI_SESSION_TOKEN.

Market Open (9:16 AM):

main.py ➡️ signal_service.py (Reads "Green")

main.py ➡️ icici_breeze.py (Reads LTP: 24280)

main.py ➡️ mock_broker.py (Logs SELL_PUT 24300 PE)

Analyze: Query the system via React UI: "What was the signal today and what price did we enter?"

🛠️ Tech Stack
LLM: Groq (Llama-3.3-70B-Versatile)

Frameworks: LangGraph, FastAPI, ReactJS

Protocol: MCP (Model Context Protocol)

Database: SQLite via SQLAlchemy

Data Science: Pandas, FAISS (Vector Search)

Developed by Narayanan Selvaraj - Team Lead | Full-Stack LLM & ReactJS.

---

graph TD
%% 9:16 AM Automated Journey
subgraph "A. 9:16 AM: The Automated Trading Journey"
Scheduler[Daily Scheduler (APScheduler)] -->|1. Fired 9:16 AM| DailyJob[Daily Trade Job (main.py)]
DailyJob -->|2. Check Today's Signal| SignalSVC[Signal Service (signals.csv)]
SignalSVC -->|Returns 'Green'| DailyJob
DailyJob -->|3. Execute Strategy| StratSVC[Strategy Service (strategy_service.py)]

        %% Broker and Data Flow
        StratSVC -->|4a. Fetch Live Nifty Price| ICICI[ICICI Breeze Client]
        ICICI -->|4b. Return 24,xxx.x| StratSVC
        StratSVC -->|5. Strike Selection Logic| StratSVC
        StratSVC -->|6. Log Trade| Mock[Mock Broker]
        Mock -->|7. INSERT INTO `dummy_trades`| SQLite[app/db/memory.db]
    end

    %% AI Agent Journey
    subgraph "B. User Interaction Journey"
        UI[React UI (localhost:3000)] -->|1. User Question| FastAPI[FastAPI (localhost:8001)]
        FastAPI -->|2. Invoke Agent Graph| LangGraph[LangGraph AI Agent (main.py)]
        LangGraph -->|3. Get System Prompt| LangGraph
        LangGraph -->|4. Router Node| Router{Web, Local, or Hybrid?}

        %% AI Routing Decisions
        Router -->|5. "Web" Request| Groq[Groq Llama-3 70B]
        Groq -->|6. Search Query| Search[SerpApi/Web Tool]
        Router -->|7. "Local" Request| Groq
        Groq -->|8. Structured SQL Call| SQLite
        Router -->|9. "Document" Request| Groq
        Groq -->|10. FAISS Lookup| FAISS[Vector Store]

        %% MCP Link (Not in image)
        %% Groq <-->|Tool Execution via| MCP_SSE[MCP Server SSE connection]
    end

    %% Data Connections
    SQLite -.-o SignalSVC
    SQLite -.-o FAISS

---

1. The agents Folder: The Logic Orchestrator
   trading_agent.py:

Role: This contains the "Intelligence." It defines the LangGraph nodes that decide when to use a tool.

The Flow: It sits between the user and the data. When you ask a question in the UI, main.py sends it here. This file then tells the LLM: "Use the MCP tool to check memory.db" or "Search the web."

2. The brokers Folder: The External Gateways
   base.py:

Role: The "Contract." It defines an abstract class (BaseBroker) with empty methods like get_nifty_price() and place_order().

The Flow: It ensures that both your real broker and your mock broker follow the exact same rules.

icici_breeze.py:

Role: The "Live Pipe." It uses your API keys and the Breeze SDK to talk to the actual stock market.

The Flow: strategy_service.py calls this to get the real-time LTP (Last Traded Price).

test_connection.py:

Role: A utility script.

The Flow: You run this manually to verify your .env session token is still valid without starting the whole backend.

3. The core Folder: The Business Engine
   strategy_service.py:

Role: The "Decision Maker." This is where your financial astrology rules live.

The Flow: At 9:16 AM, this file takes the signal (Green/Red) and the Nifty price, then calculates the strike price.

signal_service.py:

Role: The "Data Reader."

The Flow: It opens signals.csv, finds the row for "today," and sends the color back to the strategy service.

mock_broker.py:

Role: The "Safety Net."

The Flow: It acts like a real broker but instead of sending an order to the NSE, it sends a record to your memory.db. It effectively "fakes" the execution so you can track performance for free.

4. The db Folder: The Persistence Layer
   database.py:

Role: The "Connection Manager." It handles the SQLite engine and creates the session.

models.py:

Role: The "Blueprints." It defines what a DummyTrade looks like (date, price, symbol, etc.).

memory.db files:

Role: The "Storage." This is the actual file where your trades and AI conversation history are saved. The -wal and -shm files are temporary files SQLite uses to handle multiple tasks at once (Write-Ahead Logs).

The Integrated Data Flow
Imagine a single "Trade Event" at 9:16 AM:

Trigger: main.py (Scheduler) calls daily_trade_job().

Lookup: signal_service.py reads the CSV and sees "Green".

Calculation: strategy_service.py asks icici_breeze.py for the price (24280) and decides to trade the 24300 PE.

Logging: mock_broker.py takes that info, creates a DummyTrade using the blueprint in models.py, and saves it via database.py.

Confirmation: The trade is now physically inside memory.db.

Query: Later, the User asks the trading_agent.py about the trade. The agent uses the MCP Server to read the memory.db and gives you the answer.

--
