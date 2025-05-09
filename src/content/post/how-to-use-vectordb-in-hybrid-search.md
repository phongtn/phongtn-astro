---
title: "Sử dụng VectorDB để build hệ thống Hybrid Search"
description: "Sử dụng tính tương tự Vector và  SQL để xây dựng lớp truy vấn Knowledge tối ưu cho LLM."
publishDate: "2025-05-07"
tags: ["agent", "vectordb",]
---
# VectorDB và Pgvector trong hệ thống Hybrid Search

Trong các hệ thống kết hợp giữa tìm kiếm ngữ nghĩa (semantic search) và truy vấn dữ liệu có cấu trúc (SQL), việc định tuyến và tối ưu hóa giữa Vector Database và SQL Database là rất quan trọng. Tài liệu này tổng hợp những nguyên tắc cốt lõi và khuyến nghị sử dụng pgvector, ChromaDB cùng LLM một cách hiệu quả.

---

## 1. Cách hoạt động của hệ thống Hybrid Search

Hệ thống định tuyến truy vấn (Hybrid Search Router) sẽ hoạt động như sau:

```
+-------------------+
|   User Query      |
+--------+----------+
         |
         v
+-------------------+
|   Intent Router   | <-- dùng LLM để xác định mục tiêu: SQL hay Vector
+--------+----------+
         |
   +-----+------+
   |            |
   v            v
+------+    +----------------+
| SQL  |    | Vector Search  |
+------+    +----------------+
   |            |
   +-----+------+
         v
+----------------------+
| Format with LLM      |
+----------------------+
         |
         v
+----------------------+
|  Final Response      |
+----------------------+
```

---

## 2. Truy vấn VectorDB: Hiểu về Top-K và hạn chế

* Khi truy vấn VectorDB như ChromaDB hoặc pgvector, bạn thường nhận lại **Top-K kết quả gần nhất**.
* **Top-K** là số lượng vector giống nhất được trả về từ tập dữ liệu.
* Nếu bạn yêu cầu "liệt kê tất cả sản phẩm trong bộ dữ liệu", VectorDB không phù hợp vì:

    * VectorDB không thiết kế để **quét toàn bộ tập dữ liệu**.
    * Thay vào đó, nên sử dụng **truy vấn SQL**.

\=> **Giải pháp:**

* Dùng LLM để phân tích intent.
* Nếu người dùng yêu cầu tổng hợp, thống kê, lọc không theo ngữ nghĩa → **truy vấn SQL**.
* Nếu người dùng đặt câu hỏi mở, cần hiểu ngữ nghĩa → **dùng Vector Search**.

---

## 3. Chuyển ChromaDB sang dùng local embedding

* Mặc định ChromaDB sử dụng embedding từ mô hình OpenAI hoặc HuggingFace.
* Để dùng local embedding:

    * Bạn có thể dùng mô hình như `sentence-transformers` để generate vector.
    * Sau đó lưu vào ChromaDB thông qua `.add(documents=..., embeddings=...)`.

---

## 4. Toán tử trong pgvector

### Toán tử chính:

| Toán tử | Mô tả                   | Khoảng cách | Giá trị càng nhỏ → càng giống |
| ------- | ----------------------- | ----------- | ----------------------------- |
| `<->`   | Euclidean distance (L2) | Tuyến tính  | ✅                             |
| `<=>`   | Cosine distance         | Góc         | ✅                             |
| `<#>`   | Inner product (âm dot)  | Tương quan  | ✅                             |

### Hàm tương đương:

```sql
l2_distance(vec1, vec2)
cosine_distance(vec1, vec2)
inner_product(vec1, vec2)
```

### Sử dụng trong truy vấn:

```sql
SELECT * FROM products
ORDER BY embedding <-> '[...]'::vector
LIMIT 5;
```

---

## 5. So sánh Euclidean, Cosine, Inner Product

| Tiêu chí                   | Euclidean (`<->`)    | Cosine (`<=>`)          | Inner Product (`<#>`)     |
| -------------------------- | -------------------- | ----------------------- | ------------------------- |
| Ý nghĩa                    | Khoảng cách hình học | Độ lệch hướng           | Mức tương quan tuyến tính |
| Giá trị càng nhỏ           | ✅ Gần hơn            | ✅ Giống hơn             | ✅ Giống hơn               |
| Chuẩn hóa vector cần thiết | ❌ Không              | ✅ Nên chuẩn hóa         | ✅ (nên chuẩn hóa)         |
| Phù hợp với                | Vector dày, thực địa | Vector sparse/ngữ nghĩa | Mô hình học sâu           |

---

## 6. Khi nào dùng SQL, khi nào dùng Vector Search

| Mục tiêu câu hỏi                               | Loại truy vấn phù hợp |
| ---------------------------------------------- | --------------------- |
| Liệt kê, thống kê, lọc sản phẩm theo field     | SQL                   |
| Tìm sản phẩm giống mô tả (mơ hồ/ngữ nghĩa)     | Vector Search         |
| Tìm sản phẩm tương đồng theo embedding         | Vector Search         |
| Truy vấn có logic rõ ràng, theo trường dữ liệu | SQL                   |

### ✅ Hệ thống nên dùng LLM để xác định ý định truy vấn:

* Nếu thấy người dùng hỏi kiểu:

    * "Liệt kê tất cả...", "Cho tôi top 10 sản phẩm..." → **SQL**
    * "Tôi đang tìm một đôi giày phù hợp với trời mưa" → **Vector search**
