# Telecom Customer Feedback RAG — Build Log

**Project:** Telecom Customer Feedback RAG
**Date started:** 19 October 2026
**Status:** Phase 1 complete — FastAPI successfully retrieves five synthetic customer-feedback records from Supabase.
**Documentation version:** 1.0

## 1. Project objective

Build a retrieval-augmented generation (RAG) application end to end to understand and explain every component in future AI Engineer interviews. The application will answer natural-language questions about telecom customer feedback using evidence retrieved from stored comments.

**Planned stack:** React + TypeScript (frontend), FastAPI (Python API), Supabase PostgreSQL (source records), Pinecone (vector database), LangChain (orchestration), Groq (LLM inference). An embedding provider/model has **not yet been selected or configured** for this new build.

**Planned flow:**

1. Store customer-feedback records in PostgreSQL.
2. Read records from PostgreSQL using the backend.
3. Generate embeddings for records and upsert them to Pinecone (not yet built).
4. Embed incoming questions, retrieve relevant records from Pinecone, and generate grounded responses (not yet built).
5. Expose the RAG service via FastAPI and connect a React interface (not yet built).
6. Evaluate retrieval quality, answer faithfulness, and no-answer behavior (not yet built).

## 2. Local project setup

**Working folder:** `telecom-rag` (inside the user's Telkom OneDrive Documents/PROJECTS directory).
**Environment:** Windows, Git Bash, Python virtual environment named `venv`.

Virtual environment activated with:

```bash
source venv/Scripts/activate
```

The initial `requirements.txt` contained:

```text
langchain
langchain-community
langchain-pinecone
langchain-groq
langchain-text-splitters
python-dotenv
```

Added:

```text
fastapi
uvicorn[standard]
supabase
pydantic-settings
```

Installed with:

```bash
python -m pip install -r requirements.txt
```

**Observed result:** `Successfully installed ... fastapi ... supabase ... uvicorn ...` with no installation failure. A pip upgrade notice was informational only.

## 3. Current backend files

```text
telecom-rag/
├── .env                  # local credentials; do not commit
├── requirements.txt
├── venv/                 # local virtual environment; do not commit
└── backend/
    ├── __init__.py
    ├── database.py
    └── main.py
```

### `backend/database.py`

```python
import os
from dotenv import load_dotenv
from supabase import create_client

load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")

supabase = create_client(SUPABASE_URL, SUPABASE_KEY)
```

**Purpose:** Loads credentials from `.env` and initializes a Supabase API client. It does not directly open a raw PostgreSQL connection.

### `backend/main.py`

```python
from fastapi import FastAPI
from backend.database import supabase

app = FastAPI(title="Telecom RAG API")


@app.get("/")
def home():
    return {"message": "Telecom RAG API is running"}


@app.get("/feedback")
def get_feedback():
    response = supabase.table("customer_feedback").select("*").execute()
    return response.data
```

**Purpose:** `/` is a health-style welcome endpoint. `/feedback` queries the Supabase `customer_feedback` table and returns rows as JSON. This is **not yet a RAG endpoint**.

### `.env` structure (example only; no real secrets)

```dotenv
SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
SUPABASE_KEY=YOUR_PUBLISHABLE_KEY
```

**Important:** The URL must be the base project URL, **without** `/rest/v1`. The Supabase client constructs its own API paths.

Recommended `.gitignore` entries:

```gitignore
.env
venv/
__pycache__/
*.pyc
```

## 4. Supabase database

Created table in Supabase SQL Editor:

```sql
CREATE TABLE customer_feedback (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    post_text TEXT NOT NULL,
    sentiment VARCHAR(20),
    topic VARCHAR(100),
    channel VARCHAR(50),
    region VARCHAR(100)
);
```

The SQL Editor showed `Success. No rows returned` for the table-creation statement. This confirms execution succeeded; it does not mean that records were inserted.

Checked record count:

```sql
SELECT COUNT(*) AS total_records
FROM customer_feedback;
```

**Initial count:** `0`.

Inserted five **synthetic demonstration records**:

```sql
INSERT INTO customer_feedback
(post_text, sentiment, topic, channel, region)
VALUES
('My fibre internet has been down for three days.',
 'Negative', 'Connectivity', 'Twitter', 'Gauteng'),
('I was charged twice for my monthly fibre subscription.',
 'Negative', 'Billing', 'Facebook', 'Western Cape'),
('The technician arrived on time and fixed my connection.',
 'Positive', 'Technical Support', 'Survey', 'Gauteng'),
('My internet speed drops every evening.',
 'Negative', 'Network Performance', 'Twitter', 'KwaZulu-Natal'),
('Customer support keeps transferring my calls without resolving my issue.',
 'Negative', 'Customer Service', 'Survey', 'Limpopo');
```

Re-ran the count query. **Confirmed count:** `5`.

## 5. How the backend was started

From the `telecom-rag` **project root**:

```bash
python -m uvicorn backend.main:app --reload
```

Expected local addresses:

- Welcome endpoint: `http://127.0.0.1:8000/`
- Feedback endpoint: `http://127.0.0.1:8000/feedback`
- Interactive API docs: `http://127.0.0.1:8000/docs`

`--reload` restarts the development server when Python source files change. Restart manually after `.env` changes to ensure updated credentials are loaded.

## 6. Troubleshooting history — errors and fixes

### Error 1 — `ModuleNotFoundError: No module named 'backend'`

**What happened:** Ran `python -m uvicorn main:app --reload` while inside the `backend/` directory, although `main.py` imported `from backend.database import supabase`.

**Why:** The package import assumed the project root was on Python's import path.

**Fix:** Navigate to `telecom-rag/` and run `python -m uvicorn backend.main:app --reload`.

### Error 2 — `Could not import module "main"`

**What happened:** From the project root, ran `python -m uvicorn main:app --reload`.

**Why:** There is no root-level `main.py`; the module is `backend.main`.

**Fix:** Use `python -m uvicorn backend.main:app --reload`.

### Error 3 — Supabase `PGRST125: Invalid path specified in request URL`

**What happened:** The `/feedback` endpoint returned HTTP 500. Supabase/PostgREST rejected the request path.

**Cause confirmed by user:** `SUPABASE_URL` contained `/rest/v1`.

**Fix:** Remove `/rest/v1` from the URL, save `.env`, restart Uvicorn.

**Lesson:** SDKs commonly construct their own API paths; pass the documented base URL.

### Error 4 — Supabase `42501: permission denied for table customer_feedback`

**What happened:** After correcting the URL, `/feedback` still returned HTTP 500 with a permission error. The server could now reach the database API.

**Why:** The publishable-key request was operating under the `anon` role, which lacked SELECT privileges on the table.

**Demo fix applied in SQL Editor:**

```sql
GRANT USAGE ON SCHEMA public TO anon;
GRANT SELECT ON TABLE public.customer_feedback TO anon;

ALTER TABLE public.customer_feedback ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow demo feedback reads"
ON public.customer_feedback
FOR SELECT
TO anon
USING (true);
```

**Security note:** This policy allows unauthenticated reads of **all rows** in this table. It is acceptable only for this deliberately public synthetic-demo dataset. Do not use it for real customer data or confidential information. Before deploying with real data, replace it with appropriately scoped authentication and RLS policies.

### Final result — Success

Browser request to `http://127.0.0.1:8000/feedback` returned a JSON array of **five records** with `id`, `created_at`, `post_text`, `sentiment`, `topic`, `channel`, and `region`.

**Verified milestone:** `FastAPI -> Supabase API -> PostgreSQL customer_feedback -> JSON response` works.

## 7. Concepts learned and interview explanations

**FastAPI:** A Python framework for building HTTP APIs. A route decorator such as `@app.get('/feedback')` associates an incoming GET request with a Python function.

**Supabase:** Hosted PostgreSQL with APIs, authentication, and row-level security. In this implementation, the Python Supabase SDK uses the data API to retrieve rows.

**Environment variables:** `.env` holds configuration such as project URL and API key separately from code. The file should not be committed to version control.

**HTTP 200 vs 500:** `200 OK` means the request succeeded; `500 Internal Server Error` indicates the backend failed while processing the request. The traceback reveals the actual underlying error.

**SQL grants vs RLS:** SQL privileges decide whether a database role can read a table at all. RLS policies then determine which rows it may read when RLS is enabled. Both must permit the request.

**Current architecture vs RAG:** Returning all database records as JSON proves database integration, **not** semantic retrieval or generation. Those components come next.

## 8. Next steps

1. Select an embedding model/provider and configure a Pinecone index with the matching vector dimension.
2. Build the ingestion script: fetch Supabase records, clean/prepare text, create embeddings, upsert vectors plus metadata into Pinecone.
3. Verify stored vectors and run semantic similarity searches.
4. Build a grounded generation endpoint using Groq, with source references and explicit handling for insufficient evidence.
5. Add automated evaluation for retrieval relevance and answer faithfulness.
6. Connect a React + TypeScript chat interface.

**Learning approach:** Implement and verify one step at a time; record the purpose, exact commands, observed output, errors, and fixes after each milestone.

---

*This log records steps and results evidenced in the conversation. It does not claim that unbuilt RAG components are complete.*
