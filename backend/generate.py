import os

from dotenv import load_dotenv
from pinecone import Pinecone
from sentence_transformers import SentenceTransformer
from langchain_groq import ChatGroq
from langchain_core.messages import SystemMessage, HumanMessage

load_dotenv()

# 1. Connect to Pinecone
pc = Pinecone(api_key=os.getenv("PINECONE_API_KEY"))
index = pc.Index("telecom-feedback")

# 2. Load the same embedding model used during ingestion
embedding_model = SentenceTransformer(
    "sentence-transformers/all-MiniLM-L6-v2"
)

# 3. Initialize the LLM
llm = ChatGroq(
    model="openai/gpt-oss-20b",
    temperature=0
)


# 4. Create a reusable RAG function
def generate_answer(question: str):

    # 5. Convert the user's question into an embedding
    query_vector = embedding_model.encode(question).tolist()

    # 6. Retrieve relevant comments from Pinecone
    results = index.query(
        vector=query_vector,
        top_k=3,
        include_metadata=True
    )

    comments = [
        match.metadata["post_text"]
        for match in results.matches
    ]

    # 7. Prepare retrieved comments as context
    context = "\n".join(
        f"{i}. {comment}"
        for i, comment in enumerate(comments, start=1)
    )

    # 8. Generate a grounded answer using Groq
    messages = [
        SystemMessage(content="""
You are a telecom customer feedback analyst.

Answer questions using ONLY the customer comments provided.

Do not invent information or make unsupported assumptions.

If the comments do not contain enough information,
say that there is insufficient information.
"""),
        HumanMessage(content=f"""
Customer comments:
{context}

Question:
{question}
""")
    ]

    response = llm.invoke(messages)

    # 9. Return the answer and retrieved sources
    return {
        "question": question,
        "answer": response.content,
        "sources": comments
    }


# 10. Allow direct testing from the terminal
if __name__ == "__main__":

    question = "What internet problems are customers experiencing?"

    result = generate_answer(question)

    print("\nQUESTION:")
    print(result["question"])

    print("\nRETRIEVED COMMENTS:")
    for comment in result["sources"]:
        print(f"- {comment}")

    print("\nLLM ANSWER:")
    print(result["answer"])
