"""RAG retrieval using hosted MiniLM embeddings to keep the API memory-light."""
import os

from dotenv import load_dotenv
from groq import Groq
from huggingface_hub import InferenceClient
from pinecone import Pinecone

load_dotenv()

MODEL_ID = "sentence-transformers/all-MiniLM-L6-v2"
INDEX_NAME = "telecom-feedback"


def generate_answer(question: str) -> dict:
    token = os.getenv("HF_TOKEN")
    if not token:
        raise RuntimeError("HF_TOKEN is missing. Add a Hugging Face access token to Render environment variables.")

    # Hosted inference: does not load PyTorch or model weights in this process.
    embedding_client = InferenceClient(token=token)
    try:
        vector = embedding_client.feature_extraction(question, model=MODEL_ID)
    except Exception as exc:
        raise RuntimeError(
            "Hosted MiniLM embedding request failed. Confirm this model is available "
            "for feature extraction on your Hugging Face account/provider."
        ) from exc

    query_vector = vector.tolist() if hasattr(vector, "tolist") else list(vector)
    # Mean-pooling is not equivalent to sentence-transformer pooling; the hosted
    # feature-extraction endpoint must return a sentence-level 384-d vector.
    if len(query_vector) != 384 or any(isinstance(v, (list, tuple)) for v in query_vector):
        raise RuntimeError("Embedding service did not return a 384-dimensional sentence vector.")

    index = Pinecone(api_key=os.environ["PINECONE_API_KEY"]).Index(INDEX_NAME)
    results = index.query(vector=query_vector, top_k=3, include_metadata=True)
    comments = [str((match.metadata or {}).get("post_text", "")) for match in results.matches]
    comments = [comment for comment in comments if comment]
    if not comments:
        return {"question": question, "answer": "There is insufficient information in the retrieved customer comments.", "sources": []}

    context = "\n".join(f"{i}. {comment}" for i, comment in enumerate(comments, 1))
    response = Groq(api_key=os.environ["GROQ_API_KEY"]).chat.completions.create(
        model="openai/gpt-oss-20b",
        temperature=0,
        messages=[
            {"role": "system", "content": "You are a telecom customer feedback analyst. Answer using ONLY the supplied customer comments. Do not invent information. If insufficient, say so."},
            {"role": "user", "content": f"Customer comments:\n{context}\n\nQuestion:\n{question}"},
        ],
    )
    return {"question": question, "answer": response.choices[0].message.content, "sources": comments}
