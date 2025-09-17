
#!/usr/bin/env python3
"""
Image similarity tool (SigLIP + optional SSIM).

Usage:
  python image_similarity.py --gt path/to/ground_truth.jpg --test path/to/test.jpg
  # Choose metric:
  python image_similarity.py --gt GT.png --test TEST.png --metric both
  # Pick a different SigLIP model:
  python image_similarity.py --gt GT.jpg --test TEST.jpg --model google/siglip-base-patch16-224

Install:
  pip install -r requirements.txt

Notes:
  • SigLIP gives a semantic similarity score using image embeddings (cosine in [0,1]).
  • SSIM gives a structural/pixel-level similarity in [0,1].
"""

import argparse
import json
from pathlib import Path
from typing import Dict, Optional, Union
import io
import base64

import numpy as np
from PIL import Image

# Optional imports guarded for clean error messages
try:
    import torch
    from transformers import AutoProcessor, AutoModel
except Exception as e:
    torch = None
    AutoProcessor = None
    AutoModel = None

try:
    from skimage.metrics import structural_similarity as ssim
except Exception:
    ssim = None


def load_image(path: Union[str, bytes, io.BytesIO]) -> Image.Image:
    """Load image from file path, bytes, or BytesIO object."""
    if isinstance(path, str):
        img = Image.open(path).convert("RGB")
    elif isinstance(path, bytes):
        img = Image.open(io.BytesIO(path)).convert("RGB")
    elif isinstance(path, io.BytesIO):
        img = Image.open(path).convert("RGB")
    else:
        raise ValueError("Invalid image input type")
    return img


def ensure_same_size(img_a: Image.Image, img_b: Image.Image) -> (Image.Image, Image.Image):
    """Resize test image to ground-truth size to make SSIM valid."""
    if img_a.size == img_b.size:
        return img_a, img_b
    return img_a, img_b.resize(img_a.size, Image.BICUBIC)


def compute_siglip_similarity(gt_path: Union[str, bytes, io.BytesIO], test_path: Union[str, bytes, io.BytesIO], model_name: str, device: Optional[str] = None) -> float:
    if torch is None or AutoProcessor is None or AutoModel is None:
        raise RuntimeError("SigLIP requires 'torch' and 'transformers'. Please run: pip install -r requirements.txt")
    device = device or ("cuda" if torch.cuda.is_available() else "cpu")

    processor = AutoProcessor.from_pretrained(model_name)
    model = AutoModel.from_pretrained(model_name)
    model.eval()
    model.to(device)

    gt = load_image(gt_path)
    test = load_image(test_path)

    inputs = processor(images=[gt, test], return_tensors="pt")
    inputs = {k: v.to(device) for k, v in inputs.items() if hasattr(v, "to")}

    with torch.no_grad():
        # SigLIP (like CLIP) exposes get_image_features
        feats = model.get_image_features(**inputs)  # shape: (2, D)
        feats = torch.nn.functional.normalize(feats, dim=-1)

    cos = (feats[0] * feats[1]).sum().item()  # cosine in [-1, 1]
    score_01 = (cos + 1.0) / 2.0             # map to [0, 1] for readability
    return float(score_01)


def compute_ssim_similarity(gt_path: Union[str, bytes, io.BytesIO], test_path: Union[str, bytes, io.BytesIO]) -> float:
    if ssim is None:
        raise RuntimeError("SSIM requires 'scikit-image'. Please run: pip install -r requirements.txt")
    gt = load_image(gt_path)
    test = load_image(test_path)
    gt, test = ensure_same_size(gt, test)

    gt_np = np.array(gt, dtype=np.float32)
    test_np = np.array(test, dtype=np.float32)

    # Convert to Y channel (luma) for robustness
    def rgb_to_y(arr: np.ndarray) -> np.ndarray:
        r, g, b = arr[..., 0], arr[..., 1], arr[..., 2]
        return 0.2126 * r + 0.7152 * g + 0.0722 * b

    gt_y = rgb_to_y(gt_np)
    test_y = rgb_to_y(test_np)

    score, _ = ssim(gt_y, test_y, data_range=255.0, full=True)
    return float(max(0.0, min(1.0, score)))


def run(gt: Union[str, bytes, io.BytesIO], test: Union[str, bytes, io.BytesIO], model_name: str, metric: str, device: Optional[str], out_json: Optional[str] = None) -> Dict[str, float]:
    results: Dict[str, float] = {}
    if metric in ("siglip", "both"):
        results["siglip"] = compute_siglip_similarity(gt, test, model_name, device=device)
    if metric in ("ssim", "both"):
        results["ssim"] = compute_ssim_similarity(gt, test)

    # Calculate combined score (weighted average)
    if "siglip" in results and "ssim" in results:
        results["combined"] = (results["siglip"] * 0.7 + results["ssim"] * 0.3)
        results["similarity_percentage"] = results["combined"] * 100
    elif "siglip" in results:
        results["similarity_percentage"] = results["siglip"] * 100
    elif "ssim" in results:
        results["similarity_percentage"] = results["ssim"] * 100

    if out_json:
        Path(out_json).parent.mkdir(parents=True, exist_ok=True)
        with open(out_json, "w", encoding="utf-8") as f:
            json.dump(results, f, indent=2)
    return results


def main():
    parser = argparse.ArgumentParser(description="Compare two images and output similarity score(s).")
    parser.add_argument("--gt", required=True, help="Path to ground-truth image")
    parser.add_argument("--test", required=True, help="Path to test image")
    parser.add_argument("--metric", default="siglip", choices=["siglip", "ssim", "both"], help="Similarity metric to use")
    parser.add_argument("--model", default="google/siglip-so400m-patch14-384", help="Hugging Face model id for SigLIP")
    parser.add_argument("--device", default=None, help="PyTorch device (e.g., 'cuda', 'cpu'); default auto-detect")
    parser.add_argument("--output_json", default=None, help="Optional path to write scores as JSON")

    args = parser.parse_args()
    scores = run(args.gt, args.test, args.model, args.metric, args.device, args.output_json)

    # Pretty print
    for k, v in scores.items():
        print(f"{k.upper()} similarity: {v:.4f}")
    if args.output_json:
        print(f"Saved JSON to: {args.output_json}")


def calculate_similarity_from_bytes(test_image_bytes: bytes, anchor_destination: str, model_name: str = "google/siglip-so400m-patch14-384") -> float:
    """Calculate similarity score between test image bytes and ground truth for given anchor destination."""
    # Map destination names to ground truth files
    ground_truth_map = {
        # Location names
        "Kitchen": "/Users/subha/Downloads/UWBNavigator-Web/similarity/kitchen.png",
        "Meeting Room": "/Users/subha/Downloads/UWBNavigator-Web/similarity/meetingRoom.png",
        "Window": "/Users/subha/Downloads/UWBNavigator-Web/similarity/window.png",
        # Anchor user names
        "akshata": "/Users/subha/Downloads/UWBNavigator-Web/similarity/kitchen.png",
        "Akshata": "/Users/subha/Downloads/UWBNavigator-Web/similarity/kitchen.png",
        "subhavee1": "/Users/subha/Downloads/UWBNavigator-Web/similarity/window.png",
        "Subhavee1": "/Users/subha/Downloads/UWBNavigator-Web/similarity/window.png",
        "elena": "/Users/subha/Downloads/UWBNavigator-Web/similarity/meetingRoom.png",
        "Elena": "/Users/subha/Downloads/UWBNavigator-Web/similarity/meetingRoom.png",
        # Also handle display names from the anchor setup
        "Kitchen Anchor": "/Users/subha/Downloads/UWBNavigator-Web/similarity/kitchen.png",
        "Window Anchor": "/Users/subha/Downloads/UWBNavigator-Web/similarity/window.png",
        "Meeting Room Anchor": "/Users/subha/Downloads/UWBNavigator-Web/similarity/meetingRoom.png"
    }

    if anchor_destination not in ground_truth_map:
        # Default to kitchen if unknown anchor (for testing)
        print(f"Warning: Unknown anchor destination '{anchor_destination}', defaulting to Kitchen")
        gt_path = "/Users/subha/Downloads/UWBNavigator-Web/similarity/kitchen.png"
    else:
        gt_path = ground_truth_map[anchor_destination]

    # Calculate similarity using both metrics
    results = run(gt_path, test_image_bytes, model_name, "both", None, None)

    return results.get("similarity_percentage", 0.0)


if __name__ == "__main__":
    main()
