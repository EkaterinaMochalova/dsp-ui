#!/usr/bin/env python3
"""
screen_cleaner.py — Detect and remove anomalous screen photos from a zip archive.

Usage:
    python screen_cleaner.py <archive.zip> [--reference <ref.jpg|ref.mp4>]
    python screen_cleaner.py <archive.zip> --reference ad.mp4 --threshold 0.75
"""

import argparse
import base64
import io
import json
import os
import shutil
import subprocess
import sys
import tempfile
import time
import zipfile
from pathlib import Path
from typing import Optional

import anthropic
from PIL import Image


IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".bmp", ".tiff", ".webp"}
MAX_IMAGE_DIM = 1568  # Claude vision max useful dimension
GB = 1024 ** 3


def extract_mp4_frame(mp4_path: str) -> str:
    """Extract middle frame from MP4 via ffmpeg. Returns path to temp JPEG."""
    # Get duration
    result = subprocess.run(
        [
            "ffprobe", "-v", "error",
            "-show_entries", "format=duration",
            "-of", "default=noprint_wrappers=1:nokey=1",
            mp4_path,
        ],
        capture_output=True,
        text=True,
    )
    try:
        duration = float(result.stdout.strip())
    except ValueError:
        duration = 0.0
    mid = max(duration / 2, 0.5)

    tmp = tempfile.NamedTemporaryFile(suffix=".jpg", delete=False)
    tmp.close()
    subprocess.run(
        ["ffmpeg", "-ss", str(mid), "-i", mp4_path, "-vframes", "1", "-q:v", "2", tmp.name, "-y"],
        capture_output=True,
    )
    return tmp.name


def encode_image(path: str) -> tuple[str, str]:
    """Return (base64_data, media_type) for an image, resizing if needed."""
    img = Image.open(path)
    w, h = img.size
    if max(w, h) > MAX_IMAGE_DIM:
        ratio = MAX_IMAGE_DIM / max(w, h)
        img = img.resize((int(w * ratio), int(h * ratio)), Image.LANCZOS)
    if img.mode not in ("RGB", "L"):
        img = img.convert("RGB")
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=85)
    buf.seek(0)
    return base64.b64encode(buf.read()).decode(), "image/jpeg"


def build_messages(
    img_b64: str,
    img_media: str,
    ref_b64: Optional[str],
    ref_media: Optional[str],
) -> list[dict]:
    """Build the messages payload. Reference blocks get cache_control so they are cached."""
    content = []

    if ref_b64:
        content.append({"type": "text", "text": "REFERENCE CREATIVE (what should be displayed):"})
        content.append(
            {
                "type": "image",
                "source": {"type": "base64", "media_type": ref_media, "data": ref_b64},
            }
        )
        instruction = (
            "Now analyze the following SCREEN PHOTO from the archive.\n"
            "Classify it into one of these statuses:\n"
            "  • normal          — matches the reference, properly lit, no issues\n"
            "  • off             — screen is switched off (black, very dark, or overexposed white)\n"
            "  • different_creative — screen is on but shows different content than the reference\n"
            "  • anomaly         — other issue: partial display, glitch, wrong aspect ratio, heavy obstructions, etc.\n\n"
            "Reply with ONLY valid JSON, no extra text:\n"
            '{"status": "normal"|"off"|"different_creative"|"anomaly", '
            '"reason": "brief reason (max 15 words)", "confidence": 0.0-1.0}'
        )
        # Mark everything up to and including the instruction as cacheable
        content.append({"type": "text", "text": instruction, "cache_control": {"type": "ephemeral"}})
    else:
        instruction = (
            "Analyze this SCREEN PHOTO of a digital advertising display.\n"
            "Classify it into one of these statuses:\n"
            "  • normal  — screen is on, showing content properly\n"
            "  • off     — screen is switched off (black, very dark, or overexposed white)\n"
            "  • anomaly — other issue: glitch, partial/corrupted display, heavy obstruction, etc.\n\n"
            "Reply with ONLY valid JSON, no extra text:\n"
            '{"status": "normal"|"off"|"anomaly", '
            '"reason": "brief reason (max 15 words)", "confidence": 0.0-1.0}'
        )
        content.append({"type": "text", "text": instruction})

    content.append(
        {
            "type": "image",
            "source": {"type": "base64", "media_type": img_media, "data": img_b64},
        }
    )

    return [{"role": "user", "content": content}]


def analyze_image(
    client: anthropic.Anthropic,
    image_path: str,
    ref_b64: Optional[str],
    ref_media: Optional[str],
    retries: int = 3,
) -> dict:
    img_b64, img_media = encode_image(image_path)
    messages = build_messages(img_b64, img_media, ref_b64, ref_media)

    for attempt in range(retries):
        try:
            response = client.messages.create(
                model="claude-sonnet-4-6",
                max_tokens=150,
                messages=messages,
            )
            raw = response.content[0].text.strip()
            # Strip markdown fences if present
            if raw.startswith("```"):
                raw = "\n".join(raw.split("\n")[1:-1])
            return json.loads(raw)
        except anthropic.RateLimitError:
            wait = 10 * (attempt + 1)
            print(f" [rate limit, waiting {wait}s]", end="", flush=True)
            time.sleep(wait)
        except (json.JSONDecodeError, IndexError):
            return {"status": "normal", "reason": "parse error", "confidence": 0.0}
        except Exception as e:
            if attempt == retries - 1:
                return {"status": "normal", "reason": f"error: {e}", "confidence": 0.0}
            time.sleep(3)

    return {"status": "normal", "reason": "max retries", "confidence": 0.0}


def open_viewer(path: str):
    """Open image in system default viewer (non-blocking)."""
    if sys.platform == "darwin":
        subprocess.Popen(["open", path])
    elif sys.platform == "win32":
        os.startfile(path)
    else:
        subprocess.Popen(["xdg-open", path])


def folder_size(path: str) -> int:
    total = 0
    for root, _, files in os.walk(path):
        for f in files:
            total += os.path.getsize(os.path.join(root, f))
    return total


def zip_folder(folder: str, out_zip: str):
    with zipfile.ZipFile(out_zip, "w", zipfile.ZIP_DEFLATED, compresslevel=6) as zf:
        for root, _, files in os.walk(folder):
            for f in files:
                full = os.path.join(root, f)
                zf.write(full, os.path.relpath(full, folder))


def main():
    parser = argparse.ArgumentParser(
        description="Clean anomalous screen photos from a zip archive"
    )
    parser.add_argument("archive", help="Input zip archive")
    parser.add_argument(
        "--reference", "-r",
        help="Reference creative to compare against: JPEG/PNG or MP4",
        default=None,
    )
    parser.add_argument(
        "--threshold", "-t",
        type=float,
        default=0.70,
        help="Confidence threshold for flagging (default: 0.70)",
    )
    args = parser.parse_args()

    # ── Validate inputs ──────────────────────────────────────────────────────
    if not os.path.exists(args.archive):
        sys.exit(f"Error: archive not found: {args.archive}")

    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        sys.exit("Error: set ANTHROPIC_API_KEY environment variable first")

    if args.reference and not os.path.exists(args.reference):
        sys.exit(f"Error: reference file not found: {args.reference}")

    if args.reference and args.reference.lower().endswith(".mp4"):
        try:
            subprocess.run(["ffprobe", "-version"], capture_output=True, check=True)
        except (FileNotFoundError, subprocess.CalledProcessError):
            sys.exit("Error: ffmpeg/ffprobe not found — install via `brew install ffmpeg`")

    # ── Load reference ────────────────────────────────────────────────────────
    ref_b64 = ref_media = None
    tmp_ref = None

    if args.reference:
        ref = args.reference
        if ref.lower().endswith(".mp4"):
            print(f"Extracting frame from {Path(ref).name}...")
            tmp_ref = extract_mp4_frame(ref)
            ref_b64, ref_media = encode_image(tmp_ref)
        else:
            ref_b64, ref_media = encode_image(ref)
        print(f"Reference loaded: {Path(ref).name}")

    # ── Extract archive ───────────────────────────────────────────────────────
    archive_stem = Path(args.archive).stem
    archive_dir = os.path.dirname(os.path.abspath(args.archive))
    work_dir = tempfile.mkdtemp(prefix="screen_cleaner_")
    extract_dir = os.path.join(work_dir, "extracted")
    os.makedirs(extract_dir)

    print(f"Extracting {Path(args.archive).name}...")
    with zipfile.ZipFile(args.archive, "r") as zf:
        zf.extractall(extract_dir)

    # Collect all image files
    all_files: list[str] = []
    images: list[str] = []
    for root, _, files in os.walk(extract_dir):
        for f in sorted(files):
            full = os.path.join(root, f)
            all_files.append(full)
            if Path(f).suffix.lower() in IMAGE_EXTENSIONS:
                images.append(full)

    print(f"Found {len(images)} images in archive\n")

    if not images:
        print("No images found. Exiting.")
        shutil.rmtree(work_dir)
        sys.exit(0)

    # ── Cost estimate ─────────────────────────────────────────────────────────
    # Rough: ~$0.006/image on Sonnet (input tokens); with caching ref is cheaper
    est_cost = len(images) * 0.006
    print(f"Estimated API cost: ~${est_cost:.2f} for {len(images)} images")
    confirm = input("Proceed? [y/n] ").strip().lower()
    if confirm != "y":
        shutil.rmtree(work_dir)
        sys.exit("Aborted.")

    # ── Analyze images ────────────────────────────────────────────────────────
    client = anthropic.Anthropic(api_key=api_key)
    flagged: list[tuple[str, str, str, float]] = []  # (path, status, reason, confidence)

    print()
    for i, img_path in enumerate(images):
        rel = os.path.relpath(img_path, extract_dir)
        label = f"[{i+1:>4}/{len(images)}] {rel}"
        print(label, end="", flush=True)

        result = analyze_image(client, img_path, ref_b64, ref_media)
        status = result.get("status", "normal")
        confidence = float(result.get("confidence", 0.0))
        reason = result.get("reason", "")

        if status != "normal" and confidence >= args.threshold:
            tag = {"off": "OFF", "different_creative": "DIFF CREATIVE", "anomaly": "ANOMALY"}.get(status, status.upper())
            print(f"  → [{tag}] {confidence:.0%}  {reason}")
            flagged.append((img_path, status, reason, confidence))
        else:
            print(f"  ✓")

    print(f"\n{'─'*60}")
    print(f"Analysis done. {len(flagged)} flagged out of {len(images)} images.")

    if not flagged:
        print("Archive is already clean!")
        shutil.rmtree(work_dir)
        if tmp_ref:
            os.unlink(tmp_ref)
        sys.exit(0)

    # ── Review flagged images one by one ─────────────────────────────────────
    print(f"\nReview each flagged image. Opening in your default viewer.\n")
    rejected: set[str] = set()

    for i, (img_path, status, reason, confidence) in enumerate(flagged):
        rel = os.path.relpath(img_path, extract_dir)
        print(f"{'─'*60}")
        print(f"[{i+1}/{len(flagged)}]  {rel}")
        print(f"  Status:     {status}")
        print(f"  Confidence: {confidence:.0%}")
        print(f"  Reason:     {reason}")

        open_viewer(img_path)

        while True:
            choice = input("  Remove? [y = remove / n = keep / q = stop reviewing] ").strip().lower()
            if choice in ("y", "n", "q"):
                break

        if choice == "y":
            rejected.add(img_path)
            print("  → Marked for removal")
        elif choice == "q":
            print("  → Stopping review early (remaining flagged images will be kept)")
            break
        else:
            print("  → Kept")

    # ── Build output ──────────────────────────────────────────────────────────
    print(f"\n{'─'*60}")
    print("Building output...")

    out_folder = os.path.join(archive_dir, f"{archive_stem}_cleaned")
    rej_folder = os.path.join(archive_dir, f"{archive_stem}_rejected")
    os.makedirs(out_folder, exist_ok=True)
    if rejected:
        os.makedirs(rej_folder, exist_ok=True)

    kept = 0
    for fpath in all_files:
        rel = os.path.relpath(fpath, extract_dir)
        if fpath in rejected:
            dst = os.path.join(rej_folder, rel)
            os.makedirs(os.path.dirname(dst), exist_ok=True)
            shutil.copy2(fpath, dst)
        else:
            dst = os.path.join(out_folder, rel)
            os.makedirs(os.path.dirname(dst), exist_ok=True)
            shutil.copy2(fpath, dst)
            if Path(fpath).suffix.lower() in IMAGE_EXTENSIONS:
                kept += 1

    # Zip if > 1 GB
    size = folder_size(out_folder)
    if size > GB:
        zip_path = out_folder + ".zip"
        print(f"Output is {size/GB:.1f} GB — zipping to {Path(zip_path).name}...")
        zip_folder(out_folder, zip_path)
        shutil.rmtree(out_folder)
        final_output = zip_path
    else:
        final_output = out_folder

    # Cleanup
    shutil.rmtree(work_dir)
    if tmp_ref:
        os.unlink(tmp_ref)

    print(f"\n{'='*60}")
    print(f"  Clean output : {final_output}")
    if rejected:
        print(f"  Rejected     : {rej_folder}  ({len(rejected)} images)")
    print(f"  Kept {kept} / {len(images)} images  |  Removed {len(rejected)}")
    print(f"{'='*60}")


if __name__ == "__main__":
    main()
