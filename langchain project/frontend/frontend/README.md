# Getting Started with Create React App

This project was bootstrapped with [Create React App](https://github.com/facebook/create-react-app).

## Available Scripts

In the project directory, you can run:

### `npm start`

Runs the app in the development mode.\
Open [http://localhost:3000](http://localhost:3000) to view it in your browser.

The page will reload when you make changes.\
You may also see any lint errors in the console.

### `npm test`

Launches the test runner in the interactive watch mode.\
See the section about [running tests](https://facebook.github.io/create-react-app/docs/running-tests) for more information.

### `npm run build`

Builds the app for production to the `build` folder.\
It correctly bundles React in production mode and optimizes the build for the best performance.

The build is minified and the filenames include the hashes.\
Your app is ready to be deployed!

See the section about [deployment](https://facebook.github.io/create-react-app/docs/deployment) for more information.

### `npm run eject`

**Note: this is a one-way operation. Once you `eject`, you can't go back!**

If you aren't satisfied with the build tool and configuration choices, you can `eject` at any time. This command will remove the single build dependency from your project.

Instead, it will copy all the configuration files and the transitive dependencies (webpack, Babel, ESLint, etc) right into your project so you have full control over them. All of the commands except `eject` will still work, but they will point to the copied scripts so you can tweak them. At this point you're on your own.

You don't have to ever use `eject`. The curated feature set is suitable for small and middle deployments, and you shouldn't feel obligated to use this feature. However we understand that this tool wouldn't be useful if you couldn't customize it when you are ready for it.

## Learn More

You can learn more in the [Create React App documentation](https://facebook.github.io/create-react-app/docs/getting-started).

To learn React, check out the [React documentation](https://reactjs.org/).

### Code Splitting

This section has moved here: [https://facebook.github.io/create-react-app/docs/code-splitting](https://facebook.github.io/create-react-app/docs/code-splitting)

### Analyzing the Bundle Size

This section has moved here: [https://facebook.github.io/create-react-app/docs/analyzing-the-bundle-size](https://facebook.github.io/create-react-app/docs/analyzing-the-bundle-size)

### Making a Progressive Web App

This section has moved here: [https://facebook.github.io/create-react-app/docs/making-a-progressive-web-app](https://facebook.github.io/create-react-app/docs/making-a-progressive-web-app)

### Advanced Configuration

This section has moved here: [https://facebook.github.io/create-react-app/docs/advanced-configuration](https://facebook.github.io/create-react-app/docs/advanced-configuration)

### Deployment

This section has moved here: [https://facebook.github.io/create-react-app/docs/deployment](https://facebook.github.io/create-react-app/docs/deployment)

### `npm run build` fails to minify

This section has moved here: [https://facebook.github.io/create-react-app/docs/troubleshooting#npm-run-build-fails-to-minify](https://facebook.github.io/create-react-app/docs/troubleshooting#npm-run-build-fails-to-minify)

Market Analyst Pro - MCP + LangGraph + React Stack
A full-stack market research assistant that combines local corporate knowledge (FAISS), live web search (Tavily), conversation memory (SQLite), and intelligent synthesis (Llama 3.3 on Groq).

🎯 Features
Technology Role Use Case
FAISS Knowledge Library PDF/manual fact lookup
Tavily Live Web Search Current market data
SQLite Conversation Memory Follow-up context
Llama 3.3 (Groq) AI Processor Data → human response
🚀 Quick Start
Prerequisites
powershell

# Clone & setup

git clone <your-repo>
cd python project/langchain project
python -m venv venv
.\venv\Scripts\activate
pip install -r requirements.txt # or see below

1. Environment Setup
   Copy .env.example → .env and fill in:

text
GROQ_API_KEY="your_groq_key"
TAVILY_API_KEY="your_tavily_key"
GEMINI_API_KEY="your_gemini_key"
LANGSMITH_API_KEY="your_langsmith_key"
LANGCHAIN_PROJECT="Market-Analyst-Pro"
LANGCHAIN_TRACING_V2=true 2. Ingest Corporate Documents
powershell
python ingest.py # Loads PDFs into FAISS 3. Run the Stack (4 Terminals)
Terminal 1 - MCP Server (port 8000)

powershell
cd "C:\Users\narayanan.selvaraj\python project\langchain project"
.\venv\Scripts\activate
python mcp_server.py
Terminal 2 - FastAPI Backend (port 8001)

powershell
cd "C:\Users\narayanan.selvaraj\python project\langchain project"
.\venv\Scripts\activate
uvicorn main:app --host 127.0.0.1 --port 8001 --reload
Terminal 3 - LangGraph Studio Server (port 2024)

powershell
cd "C:\Users\narayanan.selvaraj\python project\langchain project"
.\venv\Scripts\activate
langgraph dev
Terminal 4 - React Frontend (port 3000)

powershell
cd "C:\Users\narayanan.selvaraj\python project\langchain project\frontend\frontend"
npm install
npm start 4. Access Your App
Service URL Purpose
React UI http://localhost:3000 Chat interface
FastAPI Docs http://127.0.0.1:8001/docs Backend API
LangGraph Studio http://127.0.0.1:2024/docs Graph visualization
LangSmith Studio https://smith.langchain.com/studio/?baseUrl=http://127.0.0.1:2024 Agent debugging
🧪 Test Prompts
text

1. "Tell me Accenture Q2 2026 results from internal records"
   → Uses FAISS → $18B revenue, $22.1B bookings

2. "Latest news about Accenture stock"
   → Uses Tavily → Current market data

3. "Compare Accenture results with expectations"
   → FAISS + Tavily → Combined analysis
   🏗️ Architecture
   text
   User → React (3000) → FastAPI (8001) → LangGraph Agent → MCP Tools (8000)
   ↓
   FAISS + Tavily + Memory
   📦 Installation (Fresh Setup)
   powershell

# 1. Virtual environment

python -m venv venv
.\venv\Scripts\activate

# 2. Core dependencies

pip install langchain langgraph langchain-groq langchain-mcp-adapters
pip install langchain-community langchain-google-genai langchain-tavily
pip install fastapi uvicorn python-dotenv faiss-cpu

# 3. LangGraph CLI for Studio

pip install "langgraph-cli[inmem]"

# 4. Frontend

cd frontend/frontend
npm install
🔧 Key Files
File Purpose
main.py FastAPI backend + React integration
mcp_server.py MCP tools (FAISS + Tavily)
studio_graph.py LangGraph Studio graph
langgraph.json Studio configuration
ingest.py PDF → FAISS pipeline
.env API keys
🐛 Troubleshooting
LangGraph CLI not found
powershell
pip install "langgraph-cli[inmem]"
Studio "Failed to fetch"
text

1. Verify http://127.0.0.1:2024/docs loads
2. Chrome → lock icon → Allow local network access
3. Or: langgraph dev --tunnel
   MCP connection failed
   text
4. Start mcp_server.py first (port 8000)
5. Check http://127.0.0.1:8000/sse responds
   No FAISS results
   text
   python ingest.py # Rebuild index from data/
   🚀 Production Deployment
   text

# docker-compose.yml

services:
mcp-server:
build: .
ports: - "8000:8000"
env_file: .env

fastapi:
build: .
ports: - "8001:8001"
env_file: .env
depends_on: - mcp-server
📊 Success Metrics
text
✅ MCP ↔ FastAPI ↔ React streaming
✅ FAISS local docs lookup  
✅ Tavily live web search
✅ LangGraph Studio visualization
✅ LangSmith tracing & debugging
✅ Stateless chat reliability
✅ Production-ready Docker setup
