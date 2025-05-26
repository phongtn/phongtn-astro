---
title: "Tổng Hợp Kiến Thức về RAG (Retrieval-Augmented Generation)"
description: "Pipeline RAG- Các biến thể: Naive, Rerank, Multimodal, Graph, Hybrid, Agentic (Router & Multi-Agent)- So sánh và Use case thực tế"
publishDate: "2025-05-25"
tags: ["ai", "rag", "agent", "agentic"]
---

# 📘 Tổng Hợp Kiến Thức về RAG (Retrieval-Augmented Generation)

## 1. Kiến trúc tổng quát của RAG

RAG = Retrieval + Generation
- Retrieval (Truy xuất): Lấy thông tin liên quan từ kho tri thức (của doanh nghiệp, ứng dụng…)
- Generation (Sinh): Truyền thông tin vừa truy xuất vào LLM để sinh ra câu trả lời có ngữ cảnh.

```text
          +-------------+
          |   User      |
          +------+------
                 |
                 v
        +--------+--------+
        |  LLM (Prompt)   |
        +--------+--------+
                 |
                 v
        +--------+--------+
        |  Retriever       | <---- Truy vấn Embedding DB (Vector Store)
        +--------+--------+
                 |
                 v
        +--------+------------+
        | Reranker (Optional) |
        +--------+------------+
                 |
                 v
        +--------+---------+
        | Top-K documents  |
        +--------+---------+
                 |
                 v
        +--------+------+
        | LLM Generate  |
        +---------------+
```

**Các công cụ phổ biến khi xây dựng RAG**:

| Mục đích     | Công cụ                                     |
|--------------|---------------------------------------------|
| Embedding    | OpenAI, Cohere, HuggingFace models          |
| Vector Store | FAISS, Pinecone, Weaviate, Qdrant, PGvector |
| LLM Backend  | OpenAI GPT, Claude, Mistral, Gemini...      |
| Framework    | LangChain, LlamaIndex, Agno                 |

**Tóm lược luồng xử lý chính**:
```text
User Prompt
    |
    v
Embedding --> Vector DB --> Top-K Docs
    \___________________________/
                |
      Augmented Prompt (Prompt + Docs)
                |
             LLM Inference
                |
           Generated Answer
```
---

## 2. Các mô hình RAG

| Loại mô hình         | Mô tả                                                                 | Use Case                                                        |
|----------------------|----------------------------------------------------------------------|------------------------------------------------------------------|
| **Naive RAG**         | Truy vấn tài liệu và nhét trực tiếp vào prompt.                      | Hệ thống hỏi đáp đơn giản.                                      |
| **Retrieve-and-Rerank** | Sau khi retrieve, rerank để chọn tài liệu tốt nhất.                  | Legal QA, tài liệu có nhiều đoạn gần giống nhau.                |
| **Multimodal RAG**     | Tài liệu truy xuất có thể là hình ảnh, audio,...                    | Hỏi đáp y tế, RAG từ video hoặc hình ảnh                         |
| **Graph RAG**          | Sử dụng Graph Database để model hóa mối quan hệ giữa dữ kiện.       | Research assistant, báo cáo có cấu trúc phức tạp                 |
| **Hybrid RAG**         | Kết hợp symbolic search (keyword) và semantic search (vector).      | Search trên dữ liệu đa dạng, không đồng nhất.                   |
| **Agentic RAG (Router)** | Dựa trên nội dung truy vấn, route đến từng RAG agent chuyên biệt. | Chatbot đa miền (y tế, luật, giáo dục)                          |
| **Agentic RAG (Multi-Agent)** | Nhiều agent truy vấn song song, hợp nhất kết quả.             | Trợ lý cá nhân hoặc hệ thống QA tổng hợp nhiều nguồn.            |


**Sơ đồ kiến trúc các biến thể RAG**:
```text
┌────────────────────────────┐
│        User Query          │
└────────────┬───────────────┘
             ▼
      ┌────────────┐
      │ Embedding  │
      │ (Query)    │
      └────┬───────┘
           ▼
   ╔════════════════════════════════════╗
   ║          VARIANT ROUTING           ║
   ╚════════════════════════════════════╝

           ▼ Choose 1 of:

─────────────────────────────────────────────────────────────────────

[1] Naive RAG
      ▼
┌────────────┐     ┌────────────┐
│ Vector DB  │ ==> │ Top-K Docs │ ==> [Prompt] ==> [LLM]
└────────────┘     └────────────┘
→ Use Case: FAQ bot, internal doc chatbot MVP

─────────────────────────────────────────────────────────────────────

[2] Retrieve & Rerank
      ▼
┌────────────┐     ┌────────────┐     ┌──────────────┐
│ Vector DB  │ ==> │ Top-N Docs │ ==> │  Reranker    │ ==> Top-K
└────────────┘     └────────────┘     └──────────────┘
                                            ▼
                                      [Prompt] ==> [LLM]
→ Use Case: Legal QA, Research assistant

─────────────────────────────────────────────────────────────────────

[3] Multimodal RAG
      ▼
┌────────────┐     ┌────────────┐
│ Vector DB  │ ==> │ Text/Images│
└────────────┘     └────┬───────┘
                        ▼
                [Multimodal Prompt] ==> [LLM]
→ Use Case: Medical report bot, Slide reader, OCR doc chat

─────────────────────────────────────────────────────────────────────

[4] Graph RAG
      ▼
┌────────────┐
│ Graph DB   │ → query hops → subgraphs
└────┬───────┘
     ▼
[Node traversal + retrieval] ==> [Prompt] ==> [LLM]
→ Use Case: Scientific paper assistant, Academic QA

─────────────────────────────────────────────────────────────────────

[5] Hybrid RAG
      ▼
┌────────────┐   ┌─────────────┐
│ Vector DB  │ + │ BM25/Keyword│
└────┬───────┘   └────┬────────┘
     ▼                ▼
     └──────> Merge & Dedup ==> [Prompt] ==> [LLM]
→ Use Case: Technical manuals, where exact terms matter

─────────────────────────────────────────────────────────────────────

[6] Agentic RAG (Router)
       ▼
┌─────────────┐
│ Query Router│───► Chooses Vector DB A/B/C...
└────┬────────┘
     ▼
┌────────────┐
│ Vector DB X│ ==> [Prompt] ==> [LLM]
└────────────┘
→ Use Case: Multi-departmental chatbot, support portal across services

─────────────────────────────────────────────────────────────────────

[7] Agentic RAG (Multi-Agent)
        ▼
┌──────────────┐
│ Master Agent │
└───────┬──────┘
        ▼               ▼              ▼
[Retriever Agent] [Filter Agent] [Synthesizer Agent]
        ▼                ▼               ▼
   [Top Docs]      [Valid Docs]     [Final Prompt] ==> [LLM]
→ Use Case: Complex reasoning bot, Workflow-driven assistant
```

---

## 3. Re-ranking trong RAG

Re-ranking là kỹ thuật xếp hạng lại danh sách các tài liệu (hoặc câu trả lời, kết quả tìm kiếm…) đã được truy xuất (retrieved) từ một hệ thống tìm kiếm ban đầu, dựa trên độ phù hợp ngữ nghĩa (semantic relevance) với truy vấn (query) hiện tại.

**Quy trình Re-ranking**:
```text
🔍 Step 1: Retrieval (Truy xuất)
→ Truy vấn (query) được gửi đến vector store hoặc search engine
→ Trả về N tài liệu liên quan (top N based on embedding similarity hoặc BM25...)

🧠 Step 2: Re-ranking
→ Mỗi tài liệu + truy vấn được đưa qua mô hình đánh giá lại (re-ranker)
→ Mô hình cho điểm mỗi cặp (query, document)
→ Sắp xếp lại tài liệu theo điểm phù hợp

📤 Step 3: Sử dụng kết quả đã re-rank
→ Lấy top K tài liệu tốt nhất để cung cấp cho LLM
```
**Các loại Re-ranker phổ biến**:

| Re-ranker        |                          Mô tả ngắn                        |        Ví dụ mô hình      |
|------------------|:----------------------------------------------------------:|:-------------------------:|
|   Cross-Encoder  |   Nhập query + document vào 1 mô hình → tính điểm          |   BERT, MiniLM, E5        |
|   Bi-Encoder     |   Mã hóa riêng query & document → dot product → tính điểm  |   Sentence-BERT, ColBERT  |
|   LM Re-ranker   |   Dùng chính LLM để cho điểm (dùng prompt + documents)     |   GPT-4, Claude, Gemini   |


**So sánh Retrieval vs Re-ranking**:

|      Tiêu chí     |                Retrieval              |                  Re-ranking                |
|:-----------------:|:-------------------------------------:|:------------------------------------------:|
|   Mục tiêu chính  |   Truy xuất nhanh, sơ bộ              |   Tăng chất lượng kết quả                  |
|   Tốc độ          |   Rất nhanh (faiss, vector db)        |   Chậm hơn (vì cần dùng mô hình nặng hơn)  |
|   Độ chính xác    |   Trung bình (embedding có thể lệch)  |   Cao hơn nhờ mô hình ngữ nghĩa sâu        |
|   Kiến thức       |   Không cần fine-tune                 |   Có thể fine-tune theo domain             |

** Ví dụ thực tế: RAG với Re-ranking**:
```text
Người dùng hỏi: "What are the side effects of Ibuprofen?"

→ Step 1: Retrieval
    Truy xuất được 10 đoạn văn từ Wikipedia, PubMed

→ Step 2: Re-ranking
    Cross-encoder đánh giá lại: đoạn #3, #7, #1 có độ phù hợp cao nhất

→ Step 3: Cho LLM đọc 3 đoạn này để trả lời chính xác hơn
```
**Khi nào nên dùng Re-ranking?**

|                     Trường hợp                    |   Gợi ý dùng re-ranking  |
|:-------------------------------------------------:|:------------------------:|
| ❌ Kết quả truy xuất không đủ chính xác            | ✅ Có                     |
|   ✅ Yêu cầu câu trả lời có độ tin cậy cao         |   ✅ Có                   |
|   ⏱️ Hệ thống yêu cầu tốc độ cao, nhiều request/s  |   ❌ Không bắt buộc       |
|   🧾 Cần kiểm soát độ phù hợp chặt chẽ theo query  |   ✅ Có                   |


**Sơ đồ Re-ranking Pipeline trong RAG**
```text
[1] User Query
    |
    |  "What are the side effects of Ibuprofen?"
    ↓
────────────────────────────────────────────
[2] Retriever: Vector DB / Search Engine
    |
    | → Truy xuất top-N tài liệu gần giống embedding
    | → Ví dụ trả về:
    |     Doc1: "Ibuprofen may cause nausea..."
    |     Doc2: "Paracetamol is safer for stomach..."
    |     Doc3: "Common side effects of Ibuprofen are..."
    ↓
────────────────────────────────────────────
[3] Re-ranker (Cross-Encoder or LLM)
    |
    | → Đánh giá lại độ phù hợp giữa query và từng document
    | → Cho điểm từng cặp (query, doc)
    |     Doc3: 0.92
    |     Doc1: 0.83
    |     Doc2: 0.41
    ↓
────────────────────────────────────────────
[4] Top-K Documents đã được Re-rank
    |
    | → Chọn Doc3 và Doc1 làm đầu vào cho LLM
    ↓
────────────────────────────────────────────
[5] LLM
    |
    | → Trả lời dựa trên các tài liệu tốt nhất
    ↓
🧠 Final Answer:
    "The common side effects of Ibuprofen include nausea, dizziness, and stomach irritation..."
```
|   Bước  |                  Thao tác thực hiện                 |              Mô hình có thể dùng            |
|:-------:|:---------------------------------------------------:|:-------------------------------------------:|
|   1️⃣     |   Nhận query người dùng                             |   —                                         |
|   2️⃣     |   Truy xuất tài liệu tương tự                       |   FAISS, Pinecone, Weaviate, Elasticsearch  |
|   3️⃣     |   Re-rank top-N document theo độ phù hợp ngữ nghĩa  |   BGE-reranker, cross-encoder, GPT          |
|   4️⃣     |   Lọc ra K documents có điểm cao nhất               |   Top-K từ bước re-rank                     |
|   5️⃣     |   LLM đọc & tổng hợp câu trả lời                    |   OpenAI GPT-4, Claude, Mistral, LLaMA…     |

**Ghi chú**:
- Re-ranking đặc biệt quan trọng nếu tài liệu gốc dài, nhiều nhiễu, hoặc yêu cầu chính xác cao (y khoa, pháp lý).
- LLM (như GPT) cũng có thể làm luôn vai trò Re-ranker nếu được prompt đúng.
- Có thể kết hợp multi-stage retrieval: đầu tiên là dense retrieval (vector), sau đó re-rank bằng cross-encoder hoặc LLM để tăng độ chính xác.


## 4. Chunking Techniques (chia nhỏ tài liệu cho RAG)

> **Chunking** là quá trình chia nhỏ tài liệu văn bản thành những đoạn (“chunk”) hợp lý để phục vụ cho tìm kiếm, embedding, hoặc sinh văn bản.

Các chunk phải **đủ nhỏ để nhúng** (embedding) hoặc **load vào context window**, nhưng vẫn phải **giữ được ngữ nghĩa** để có thể phục vụ tốt việc truy vấn.

📚 **1. Fixed Size Chunking**

Mô tả: Chia tài liệu thành các đoạn cố định theo số lượng token, ký tự, hoặc câu.
•	Ví dụ: Cứ mỗi 512 tokens là 1 chunk.
•	Không quan tâm đến ranh giới ngữ nghĩa.

🔧 Dễ triển khai
⚠️ Có thể cắt ngang ý nghĩa câu/paragrap

Use Case: Dữ liệu đồng đều, không yêu cầu cao về ngữ nghĩa (e.g. logs, plain text content)

---

🧠 **2. Semantic Chunking**

Mô tả: Chia văn bản theo ngữ nghĩa tự nhiên – ví dụ chia theo đoạn văn, câu đầy đủ, hoặc các phần logic.
•	Dựa trên điểm dừng hợp lý (ví dụ: chấm hết, headers).
•	Có thể dùng mô hình phân tích ngữ nghĩa hoặc tóm tắt để xác định.

✅ Preserve ngữ nghĩa tốt
⚠️ Chi phí xử lý cao hơn

Use Case: Tài liệu kỹ thuật, sách, báo – nơi ngữ cảnh của đoạn rất quan trọng.

---

🔁 **3. Recursive Chunking (RAG phổ biến dùng cách này)**

Mô tả: Là kỹ thuật lai giữa semantic chunking và fixed chunking.
•	Nếu đoạn vượt quá size cho phép → chia nhỏ hơn nữa theo hierarchy:
•	Từ section → paragraph → sentence → token
•	Đảm bảo không mất ngữ nghĩa mà vẫn nằm trong size cho phép.

✅ Cân bằng ngữ nghĩa và size limit
🔁 Xử lý đệ quy rất linh hoạt

Use Case: Khi cần tối ưu chunk cho embedding/vector search nhưng vẫn đảm bảo meaning.

---

🤖 **4. Agentic Chunking**

Mô tả: Chunking do một LLM agent tự động quyết định – không cố định theo token hay cấu trúc.
•	Agent được cấp mục tiêu (ví dụ: tách đoạn liên quan đến “Security Policy”) và tự chia văn bản theo cách tối ưu.
•	Có thể kết hợp với Retrieval hoặc Routing.

🧠 Thông minh, thích nghi theo mục tiêu
⚙️ Chi phí cao, cần orchestrator hoặc agent framework

Use Case: Complex pipelines, multi-modal inputs, systems with routing.

---

📄 **5. Document Chunking**

Mô tả: Mỗi tài liệu được coi là một chunk độc lập, không chia nhỏ.
•	Dùng trong các hệ thống mà tài liệu ngắn (form, ticket), hoặc khi không muốn cắt nội dung.

✅ Bảo toàn toàn bộ ngữ cảnh
⚠️ Không phù hợp với tài liệu dài

Use Case: Email, blog ngắn, notes, Q&A form…


### So sánh tổng quan

| Kỹ thuật              | Mô tả                                                                 |
|-----------------------|----------------------------------------------------------------------|
| Fixed-size Chunking   | Cắt đều theo số token                                                |
| Semantic Chunking     | Cắt theo đoạn văn, chủ đề, context                                   |
| Recursive Chunking    | Dùng kỹ thuật top-down / bottom-up để tìm điểm chia logic            |
| Agentic Chunking      | Dùng Agent để đọc, hiểu, tự quyết định chunk                         |
| Document Chunking     | Cắt theo cấu trúc có sẵn như mục lục, heading, markdown section      |

---

## 5. Khi nào sử dụng RAG?

- Dữ liệu không nằm trong pretraining của LLM.
- Dữ liệu cần cập nhật thường xuyên (realtime, dynamic).
- Cần độ chính xác cao và có nguồn tham khảo.
- Giảm hallucination từ LLM.

---

## 6. RAG vs MCP

- **RAG**: lấy dữ liệu từ nguồn đã được indexing sẵn (offline).
- **MCP**: truy cập dữ liệu động theo thời gian thực (real-time execution).
- Nhiều hệ thống dùng kết hợp cả RAG + MCP để tận dụng điểm mạnh của mỗi mô hình.

