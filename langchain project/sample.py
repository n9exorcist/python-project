import os
from dotenv import load_dotenv
from langchain_groq import ChatGroq # New import

load_dotenv()

# Use the explicit version ID instead of the alias
llm = ChatGroq(
    model_name="llama-3.3-70b-versatile", # Or "llama3-8b-8192"
    temperature=0,
    groq_api_key=os.getenv("GROQ_API_KEY")
)

try:
    print(llm.invoke("Hello, are you active?"))
except Exception as e:
    print(f"Still failing: {e}")