# import sqlite3

# # Use the path confirmed in your VS Code explorer
# db_path = r"C:\Users\narayanan.selvaraj\python project\langchain project\app\db\memory.db"

# try:
#     # 1. Connect
#     conn = sqlite3.connect(db_path)
#     cursor = conn.cursor()

#     # 2. Run Query on the existing 'students' table
#     # I'm using * to get all columns visible in your explorer
#     cursor.execute("SELECT * FROM students")
    
#     # 3. Fetch and Print Results
#     rows = cursor.fetchall()
    
#     if not rows:
#         print("Connected! The table 'students' exists but it is currently empty.")
#     else:
#         for row in rows:
#             print(row)

# except sqlite3.Error as e:
#     print(f"Database error: {e}")

# finally:
#     # 4. Close connection
#     if conn:
#         conn.close()


import sqlite3
import pandas as pd

# Path from your VS Code environment (image_97caf2.png)
db_path = r"C:\Users\narayanan.selvaraj\python project\langchain project\app\db\memory.db"

conn = sqlite3.connect(db_path)

# Querying the top 10 most recent checkpoints
query = "SELECT thread_id, checkpoint_id, type FROM checkpoints LIMIT 10"
df_checkpoints = pd.read_sql_query(query, conn)

print("--- LangGraph Conversation Checkpoints ---")
print(df_checkpoints)

conn.close()