import os
from pathlib import Path

os.environ.setdefault("MODELSCOPE_DOWNLOAD_PARALLELS", "1")

from modelscope.hub.snapshot_download import snapshot_download


MODEL_ROOT = Path(__file__).resolve().parents[1] / ".data" / "models"
MODEL_ROOT.mkdir(parents=True, exist_ok=True)

COMMON_IGNORES = [
    "onnx/*",
    "openvino/*",
    "*.onnx",
    "*.md",
    "*.pdf",
    "imgs/*",
    "*.jpg",
    "*.png",
    "*.webp",
]


def download(model_id, folder):
    target = MODEL_ROOT / folder
    print(f"Downloading {model_id} to {target}", flush=True)
    snapshot_download(
        model_id=model_id,
        local_dir=str(target),
        ignore_patterns=COMMON_IGNORES,
    )


if __name__ == "__main__":
    download("BAAI/bge-m3", "bge-m3")
    download("AI-ModelScope/bge-reranker-v2-m3", "bge-reranker-v2-m3")
    print("BGE model download complete", flush=True)
