import os
from dotenv import load_dotenv
from langchain_groq import ChatGroq # New import

from models import GROQ_MODEL

load_dotenv()

# Use the explicit version ID instead of the alias
llm = ChatGroq(
    model_name=GROQ_MODEL,
    temperature=0,
    groq_api_key=os.getenv("GROQ_API_KEY")
)

try:
    print(llm.invoke("Hello, are you active?"))
except Exception as e:
    print(f"Still failing: {e}")