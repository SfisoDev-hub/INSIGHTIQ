import os
from dotenv import load_dotenv
from pinecone import Pinecone
from sentence_transformers import SentenceTransformer

load_dotenv()

# Connect to Pinecone
pc = Pinecone(api_key=os.getenv("PINECONE_API_KEY"))
index = pc.Index("telecom-feedback")

# Use the SAME embedding model as ingestion
model = SentenceTransformer("sentence-transformers/all-MiniLM-L6-v2")

# User question
question = "What are customers saying about internet problems?"

# Convert question into a vector
query_vector = model.encode(question).tolist()

# Search Pinecone
results = index.query(
    vector=query_vector,
    top_k=3,
    include_metadata=True
)

# Display retrieved comments
for match in results.matches:
    print(f"Score: {match.score:.4f}")
    print(f"Comment: {match.metadata['post_text']}")
    print("-" * 50)
