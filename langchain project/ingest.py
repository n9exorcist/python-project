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
DATA_PATH = "./langchain project/data"

def load_local_documents():
    loaded_docs = []
    
    if not os.path.exists(DATA_PATH):
        os.makedirs(DATA_PATH)
        print(f"Created {DATA_PATH} directory. Add your files there.")

    # 1. Load Files from Directory
    for file in os.listdir(DATA_PATH):
        # Skip temporary Excel owner files (starting with ~$)
        if file.startswith("~$"):
            continue

        file_path = os.path.join(DATA_PATH, file)
        ext = os.path.splitext(file)[1].lower()
        
        try:
            # Handle PDF
            if ext == ".pdf":
                print(f"Loading PDF: {file}")
                loader = PyPDFLoader(file_path)
                loaded_docs.extend(loader.load())

            # Handle CSV
            elif ext == ".csv":
                print(f"Loading CSV: {file}")
                loader = CSVLoader(file_path)
                loaded_docs.extend(loader.load())

            # Handle Excel via Pandas (Stable & ignores encryption/lock errors)
            elif ext in [".xlsx", ".xls"]:
                print(f"Loading Excel: {file}")
                df = pd.read_excel(file_path)
                for index, row in df.iterrows():
                    # Combine all columns into one descriptive string per row
                    content = " ".join([f"{col}: {val}" for col, val in row.items() if pd.notna(val)])
                    loaded_docs.append(Document(page_content=content, metadata={"source": file, "row": index}))

        except Exception as e:
            print(f"Error loading {file}: {e}")

    # 2. Add Manual Hardcoded Context
    manual_docs = [
        Document(page_content="The defense sector relies heavily on advanced robotics and secure supply chains."),
        Document(page_content="Gold and silver are considered safe-haven assets during market volatility."),
        Document(page_content="Copper is a highly conductive metal essential for industrial automation."),
        Document(page_content="Dikshitha is an 11-year-old girl studying at Prince Srivari School. Her hobbies include playing, and her favorite food is prawn.")
    ]
    loaded_docs.extend(manual_docs)
    return loaded_docs

print("Starting ingestion process...")

try:
    # Step 1: Load documents
    raw_documents = load_local_documents()
    
    if not raw_documents:
        print("No documents found in the /data folder.")
    else:
        # Step 2: Split into chunks
        text_splitter = RecursiveCharacterTextSplitter(chunk_size=1000, chunk_overlap=100)
        documents = text_splitter.split_documents(raw_documents)
        total_chunks = len(documents)
        print(f"Successfully processed {total_chunks} text chunks.")

        # Step 3: Embeddings with Batching to avoid 429 Errors
        embeddings = GoogleGenerativeAIEmbeddings(
            model="models/gemini-embedding-001", 
            google_api_key=gemini_key
        )

        batch_size = 25 # Google Free Tier allows 100 per minute
        vector_db = None

        for i in range(0, total_chunks, batch_size):
            batch = documents[i : i + batch_size]
            print(f"Embedding batch {i//batch_size + 1} of {(total_chunks // batch_size) + 1}...")
            
            if vector_db is None:
                # Create the initial index with the first batch
                vector_db = FAISS.from_documents(batch, embeddings)
            else:
                # Append subsequent batches
                vector_db.add_documents(batch)
            
            # Pause to reset the Google API quota (100 requests/min)
            if i + batch_size < total_chunks:
                print("Waiting 35 seconds for rate limit to reset...")
                time.sleep(35) 

        # Step 4: Save the Index
        vector_db.save_local("faiss_index")
        print("\nSUCCESS: FAISS index saved successfully to /faiss_index!")
    
except Exception as e:
    print(f"\nIngestion failed: {e}")