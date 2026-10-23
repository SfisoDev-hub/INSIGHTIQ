import os

from dotenv import load_dotenv
from pinecone import Pinecone
from sentence_transformers import SentenceTransformer
from langchain_text_splitters import RecursiveCharacterTextSplitter

from backend.database import supabase

load_dotenv()

# 1. Connect to Pinecone
pc = Pinecone(api_key=os.getenv("PINECONE_API_KEY"))
index = pc.Index("telecom-feedback")

# 2. Load embedding model
embedding_model = SentenceTransformer(
    "sentence-transformers/all-MiniLM-L6-v2"
)

# 3. Configure text chunking
text_splitter = RecursiveCharacterTextSplitter(
    chunk_size=300,
    chunk_overlap=50,
    length_function=len,
)

# 4. Retrieve all records from Supabase using pagination
records = []

page_size = 500
offset = 0

while True:
    response = (
        supabase.table("customer_feedback")
        .select("*")
        .order("id")
        .range(offset, offset + page_size - 1)
        .execute()
    )

    batch = response.data
    records.extend(batch)

    if len(batch) < page_size:
        break

    offset += page_size

print(f"Fetched {len(records)} customer feedback records.")

# 5. Split comments into chunks
chunks = []

for record in records:
    text = record["post_text"]

    split_texts = text_splitter.split_text(text)

    for chunk_number, chunk_text in enumerate(split_texts):
        chunks.append({
            "id": f"{record['id']}-chunk-{chunk_number}",
            "text": chunk_text,
            "metadata": {
                "feedback_id": record["id"],
                "chunk_number": chunk_number,
                "post_text": chunk_text,
                "sentiment": record["sentiment"] or "Unknown",
                "topic": record["topic"] or "Unknown",
                "channel": record["channel"] or "Unknown",
                "region": record["region"] or "Unknown",
            }
        })

print(f"Created {len(chunks)} text chunks.")

# 6. Generate embeddings and upload in batches
batch_size = 100

for start in range(0, len(chunks), batch_size):
    batch = chunks[start:start + batch_size]

    texts = [item["text"] for item in batch]

    embeddings = embedding_model.encode(
        texts,
        batch_size=32,
        show_progress_bar=False
    ).tolist()

    vectors = []

    for item, embedding in zip(batch, embeddings):
        vectors.append({
            "id": item["id"],
            "values": embedding,
            "metadata": item["metadata"]
        })

    index.upsert(vectors=vectors)

    print(
        f"Uploaded {min(start + batch_size, len(chunks))}"
        f"/{len(chunks)} chunks"
    )

print("\nIngestion complete!")
print(f"Feedback records: {len(records)}")
print(f"Vectors created: {len(chunks)}")
