import os
import time
import pandas as pd
from dotenv import load_dotenv
from langchain_community.vectorstores import FAISS
from langchain_google_genai import GoogleGenerativeAIEmbeddings
from langchain_core.documents import Document
from langchain_community.document_loaders import PyPDFLoader, CSVLoader
from langchain_text_splitters import RecursiveCharacterTextSplitter


load_dotenv()

gemini_key = os.getenv("GEMINI_API_KEY")
DATA_PATH = "./data"


def load_local_documents():
    loaded_docs = []

    if not os.path.exists(DATA_PATH):
        os.makedirs(DATA_PATH)
        print(f"Created {DATA_PATH} directory. Add your files there.")

    for file in os.listdir(DATA_PATH):
        if file.startswith("~$"):
            continue

        file_path = os.path.join(DATA_PATH, file)
        ext = os.path.splitext(file)[1].lower()

        try:
            if ext == ".pdf":
                loader = PyPDFLoader(file_path)
                loaded_docs.extend(loader.load())
            elif ext == ".csv":
                loader = CSVLoader(file_path)
                loaded_docs.extend(loader.load())
            elif ext in [".xlsx", ".xls"]:
                df = pd.read_excel(file_path)
                for index, row in df.iterrows():
                    content = " ".join([f"{col}: {val}" for col, val in row.items() if pd.notna(val)])
                    loaded_docs.append(Document(page_content=content, metadata={"source": file, "row": index}))
        except Exception as e:
            print(f"Error loading {file}: {e}")

    manual_docs = [
        Document(page_content="The defense sector relies heavily on advanced robotics and secure supply chains."),
        Document(page_content="Gold and silver are considered safe-haven assets during market volatility."),
        Document(page_content="Copper is a highly conductive metal essential for industrial automation."),
        Document(page_content="Accenture reported record new bookings of $22.1 billion for Q2 FY26."),
        Document(page_content="Accenture's Q2 FY26 revenues reached $18.0 billion, an 8% increase."),
        Document(page_content="CEO Julie Sweet noted significant AI-driven growth."),
        Document(page_content="Accenture declared a dividend of $1.63 per share, a 10% increase."),
        Document(page_content="Narayanan Selvaraj is a Team Lead at Accenture specializing in Full-Stack LLM and ReactJS."),
    ]

    loaded_docs.extend(manual_docs)
    return loaded_docs


print("Starting ingestion process...")

try:
    raw_documents = load_local_documents()

    if raw_documents:
        text_splitter = RecursiveCharacterTextSplitter(chunk_size=1000, chunk_overlap=100)
        documents = text_splitter.split_documents(raw_documents)

        embeddings = GoogleGenerativeAIEmbeddings(
            model="models/gemini-embedding-001",
            google_api_key=gemini_key
        )

        batch_size = 25
        vector_db = None

        for i in range(0, len(documents), batch_size):
            batch = documents[i:i + batch_size]

            if vector_db is None:
                vector_db = FAISS.from_documents(batch, embeddings)
            else:
                vector_db.add_documents(batch)

            if i + batch_size < len(documents):
                print("Waiting for rate limit...")
                time.sleep(35)

        vector_db.save_local("faiss_index")
        print("\nSUCCESS: FAISS index saved!")

except Exception as e:
    print(f"\nIngestion failed: {e}")