import json
import importlib.util
import os
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

os.environ.setdefault("CUDA_VISIBLE_DEVICES", "")
os.environ.setdefault("TOKENIZERS_PARALLELISM", "false")

HOST = os.environ.get("BGE_HOST", "127.0.0.1")
PORT = int(os.environ.get("BGE_PORT", "8001"))
EMBEDDING_MODEL = os.environ.get("BGE_EMBEDDING_MODEL", "BAAI/bge-m3")
RERANKER_MODEL = os.environ.get("BGE_RERANKER_MODEL", "BAAI/bge-reranker-v2-m3")
MODEL_ROOT = Path(os.environ.get("BGE_MODEL_ROOT", Path(__file__).resolve().parents[1] / ".data" / "models"))


def local_or_remote(model_id, folder):
    local_path = MODEL_ROOT / folder
    return str(local_path) if (local_path / "config.json").exists() else model_id


EMBEDDING_SOURCE = local_or_remote(EMBEDDING_MODEL, "bge-m3")
RERANKER_SOURCE = local_or_remote(RERANKER_MODEL, "bge-reranker-v2-m3")

embedding_model = None
reranker_model = None
model_lock = threading.Lock()


def get_embedding_model():
    global embedding_model
    if embedding_model is None:
        with model_lock:
            if embedding_model is None:
                from FlagEmbedding import BGEM3FlagModel
                embedding_model = BGEM3FlagModel(EMBEDDING_SOURCE, use_fp16=False)
    return embedding_model


def get_reranker_model():
    global reranker_model
    if reranker_model is None:
        with model_lock:
            if reranker_model is None:
                from FlagEmbedding import FlagReranker
                reranker_model = FlagReranker(RERANKER_SOURCE, use_fp16=False)
    return reranker_model


class Handler(BaseHTTPRequestHandler):
    server_version = "ZhifanBGE/1.0"

    def log_message(self, fmt, *args):
        print(f"[bge] {self.address_string()} {fmt % args}", flush=True)

    def send_json(self, status, payload):
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def read_json(self):
        size = int(self.headers.get("Content-Length", "0"))
        return json.loads(self.rfile.read(size).decode("utf-8")) if size else {}

    def do_GET(self):
        if self.path in ("/health", "/v1/health"):
            self.send_json(200, {
                "ok": True,
                "dependencies_ready": (
                    importlib.util.find_spec("torch") is not None
                    and importlib.util.find_spec("FlagEmbedding") is not None
                ),
                "embedding_model": EMBEDDING_MODEL,
                "reranker_model": RERANKER_MODEL,
                "embedding_source": EMBEDDING_SOURCE,
                "reranker_source": RERANKER_SOURCE,
                "embedding_loaded": embedding_model is not None,
                "reranker_loaded": reranker_model is not None,
                "device": "cpu"
            })
            return
        self.send_json(404, {"error": "not found"})

    def do_POST(self):
        try:
            payload = self.read_json()
            if self.path == "/v1/embeddings":
                values = payload.get("input", [])
                if isinstance(values, str):
                    values = [values]
                vectors = get_embedding_model().encode(
                    [str(item) for item in values],
                    batch_size=min(8, max(1, len(values))),
                    max_length=1024,
                    return_dense=True,
                    return_sparse=False,
                    return_colbert_vecs=False
                )["dense_vecs"]
                self.send_json(200, {
                    "object": "list",
                    "model": EMBEDDING_MODEL,
                    "data": [
                        {"object": "embedding", "index": index, "embedding": vector.tolist()}
                        for index, vector in enumerate(vectors)
                    ]
                })
                return

            if self.path == "/v1/rerank":
                query = str(payload.get("query", ""))
                documents = [str(item) for item in payload.get("documents", [])]
                pairs = [[query, document] for document in documents]
                scores = get_reranker_model().compute_score(pairs, normalize=True) if pairs else []
                if not isinstance(scores, list):
                    scores = [scores]
                ranked = sorted(
                    [
                        {"index": index, "relevance_score": float(score), "document": documents[index]}
                        for index, score in enumerate(scores)
                    ],
                    key=lambda item: item["relevance_score"],
                    reverse=True
                )
                self.send_json(200, {"model": RERANKER_MODEL, "results": ranked})
                return

            if self.path == "/warmup":
                get_embedding_model()
                get_reranker_model()
                self.send_json(200, {"ok": True})
                return

            self.send_json(404, {"error": "not found"})
        except Exception as error:
            self.send_json(500, {"error": f"{type(error).__name__}: {error}"})


if __name__ == "__main__":
    print(f"BGE service listening on http://{HOST}:{PORT}", flush=True)
    ThreadingHTTPServer((HOST, PORT), Handler).serve_forever()
