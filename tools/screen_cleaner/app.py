#!/usr/bin/env python3
"""Streamlit UI for Screen Photo Cleaner."""

import base64
import io
import json
import os
import shutil
import subprocess
import tempfile
import time
import zipfile
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from typing import Optional

import anthropic
import streamlit as st
from PIL import Image

IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".bmp", ".tiff", ".webp"}
MAX_IMAGE_DIM = 1568


# ── Image utilities ───────────────────────────────────────────────────────────

def encode_image(path: str) -> tuple[str, str]:
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


def extract_mp4_frame(mp4_path: str) -> str:
    result = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration",
         "-of", "default=noprint_wrappers=1:nokey=1", mp4_path],
        capture_output=True, text=True,
    )
    try:
        duration = float(result.stdout.strip())
    except ValueError:
        duration = 2.0
    mid = max(duration / 2, 0.5)
    tmp = tempfile.NamedTemporaryFile(suffix=".jpg", delete=False)
    tmp.close()
    subprocess.run(
        ["ffmpeg", "-ss", str(mid), "-i", mp4_path, "-vframes", "1", "-q:v", "2", tmp.name, "-y"],
        capture_output=True,
    )
    return tmp.name


def build_messages(img_b64, img_media, ref_b64, ref_media):
    content = []
    if ref_b64:
        content.append({"type": "text", "text": "REFERENCE CREATIVE (what should be displayed on the screen):"})
        content.append({"type": "image", "source": {"type": "base64", "media_type": ref_media, "data": ref_b64}})
        instruction = (
            "Now analyze the following SCREEN PHOTO from the archive.\n"
            "Classify it into one of these statuses:\n"
            "  • normal             — matches reference, properly displayed\n"
            "  • off                — screen is off (black, very dark, or overexposed white)\n"
            "  • different_creative — screen is on but shows different content than the reference\n"
            "  • anomaly            — other issue: partial display, glitch, wrong aspect ratio, heavy obstruction\n\n"
            'Reply with ONLY valid JSON: {"status": "normal"|"off"|"different_creative"|"anomaly", '
            '"reason": "brief reason max 15 words", "confidence": 0.0-1.0}'
        )
        content.append({"type": "text", "text": instruction, "cache_control": {"type": "ephemeral"}})
    else:
        instruction = (
            "Analyze this SCREEN PHOTO of a digital advertising display.\n"
            "Classify it into one of these statuses:\n"
            "  • normal  — screen is on, showing content properly\n"
            "  • off     — screen is off (black, very dark, or overexposed white)\n"
            "  • anomaly — other issue: glitch, partial/corrupted display, heavy obstruction\n\n"
            'Reply with ONLY valid JSON: {"status": "normal"|"off"|"anomaly", '
            '"reason": "brief reason max 15 words", "confidence": 0.0-1.0}'
        )
        content.append({"type": "text", "text": instruction})

    content.append({"type": "image", "source": {"type": "base64", "media_type": img_media, "data": img_b64}})
    return [{"role": "user", "content": content}]


def analyze_image(client, image_path, ref_b64, ref_media, retries=3):
    img_b64, img_media = encode_image(image_path)
    messages = build_messages(img_b64, img_media, ref_b64, ref_media)
    for attempt in range(retries):
        try:
            response = client.messages.create(
                model="claude-haiku-4-5-20251001",
                max_tokens=150,
                messages=messages,
            )
            raw = response.content[0].text.strip()
            if raw.startswith("```"):
                raw = "\n".join(raw.split("\n")[1:-1])
            return json.loads(raw)
        except anthropic.RateLimitError:
            time.sleep(10 * (attempt + 1))
        except Exception:
            if attempt == retries - 1:
                return {"status": "normal", "reason": "analysis error", "confidence": 0.0}
            time.sleep(3)
    return {"status": "normal", "reason": "max retries", "confidence": 0.0}


# ── State management ──────────────────────────────────────────────────────────

def init_state():
    defaults = {
        "phase": "setup",
        "work_dir": None,
        "extract_dir": None,
        "archive_stem": "archive",
        "images": [],
        "ref_b64": None,
        "ref_media": None,
        "threshold": 0.70,
        "results": [],
        "flagged": [],
        "review_idx": 0,
        "decisions": {},
        "api_key": "",
    }
    for k, v in defaults.items():
        if k not in st.session_state:
            st.session_state[k] = v


def reset():
    work_dir = st.session_state.get("work_dir")
    if work_dir and os.path.exists(work_dir):
        shutil.rmtree(work_dir, ignore_errors=True)
    for k in list(st.session_state.keys()):
        del st.session_state[k]
    st.rerun()


STATUS_ICON = {"off": "🔴", "different_creative": "🟠", "anomaly": "🟡", "normal": "🟢"}
STATUS_LABEL = {"off": "Off", "different_creative": "Different Creative", "anomaly": "Anomaly", "normal": "Normal"}


# ── Phases ────────────────────────────────────────────────────────────────────

def render_setup():
    st.title("Screen Photo Cleaner")
    st.caption("Upload a zip of screen photos, optionally a reference creative, and let Claude flag anomalies for review.")

    st.divider()

    col_l, col_r = st.columns(2)
    with col_l:
        zip_files = st.file_uploader(
            "Photo archives (.zip) — up to 20 archives, 300 MB each",
            type=["zip"],
            accept_multiple_files=True,
        )
    with col_r:
        ref_file = st.file_uploader("Reference creative — optional, max 300 MB", type=["jpg", "jpeg", "png", "mp4"])

    threshold = st.slider(
        "Detection confidence threshold",
        min_value=0.50, max_value=0.95, value=0.70, step=0.05,
        help="Higher = only flag very certain anomalies. Lower = flag more aggressively.",
    )

    st.divider()

    if not zip_files:
        st.info("Upload one or more zip archives to continue.")
        return

    # Validate before allowing analysis
    errors = []
    if len(zip_files) > 20:
        errors.append(f"Too many archives: {len(zip_files)} uploaded, limit is 20.")
    oversized = [f.name for f in zip_files if f.size > 300 * 1024 * 1024]
    if oversized:
        errors.append(f"These archives exceed 300 MB: {', '.join(oversized)}")
    for e in errors:
        st.error(e)
    if errors:
        return

    total_mb = sum(f.size for f in zip_files) / (1024 * 1024)
    st.caption(f"{len(zip_files)} archive{'s' if len(zip_files) > 1 else ''} selected — {total_mb:.1f} MB total")

    if st.button("Analyze Archives", type="primary", use_container_width=True):
        work_dir = tempfile.mkdtemp(prefix="screen_cleaner_")
        extract_dir = os.path.join(work_dir, "extracted")
        os.makedirs(extract_dir)

        # Extract each zip into its own subfolder (preserves filenames across archives)
        for zf_upload in zip_files:
            stem = Path(zf_upload.name).stem
            dest = os.path.join(extract_dir, stem)
            os.makedirs(dest, exist_ok=True)
            zip_path = os.path.join(work_dir, zf_upload.name)
            with open(zip_path, "wb") as f:
                f.write(zf_upload.read())
            with zipfile.ZipFile(zip_path, "r") as zf:
                zf.extractall(dest)

        images = []
        for root, _, files in os.walk(extract_dir):
            for fname in sorted(files):
                if Path(fname).suffix.lower() in IMAGE_EXTENSIONS:
                    images.append(os.path.join(root, fname))

        ref_b64 = ref_media = None
        if ref_file:
            ref_path = os.path.join(work_dir, ref_file.name)
            with open(ref_path, "wb") as f:
                f.write(ref_file.read())
            if ref_file.name.lower().endswith(".mp4"):
                try:
                    frame_path = extract_mp4_frame(ref_path)
                    ref_b64, ref_media = encode_image(frame_path)
                    os.unlink(frame_path)
                except Exception as e:
                    st.error(f"Could not extract MP4 frame: {e}. Install ffmpeg via `brew install ffmpeg`.")
                    shutil.rmtree(work_dir)
                    return
            else:
                ref_b64, ref_media = encode_image(ref_path)

        # Archive stem: single name or combined
        if len(zip_files) == 1:
            archive_stem = Path(zip_files[0].name).stem
        else:
            archive_stem = f"{Path(zip_files[0].name).stem}_and_{len(zip_files) - 1}_more"

        st.session_state.work_dir = work_dir
        st.session_state.extract_dir = extract_dir
        st.session_state.images = images
        st.session_state.archive_stem = archive_stem
        st.session_state.ref_b64 = ref_b64
        st.session_state.ref_media = ref_media
        st.session_state.threshold = threshold
        st.session_state.phase = "analyzing"
        st.rerun()


def render_analysis():
    images = st.session_state.images
    n = len(images)

    st.title("Analyzing")
    st.write(f"Processing **{n} images** with Claude Vision...")

    api_key = os.environ.get("ANTHROPIC_API_KEY") or st.session_state.api_key
    if not api_key:
        st.error("No API key found. Add it in the sidebar.")
        return

    client = anthropic.Anthropic(api_key=api_key)

    ref_b64 = st.session_state.ref_b64
    ref_media = st.session_state.ref_media
    threshold = st.session_state.threshold

    progress_bar = st.progress(0.0)
    status_line = st.empty()
    log = st.empty()
    log_lines = []

    extract_dir = st.session_state.extract_dir  # capture before threads
    results_map: dict[str, dict] = {}
    completed = 0

    def _analyze(img_path):
        rel = os.path.relpath(img_path, extract_dir)
        result = analyze_image(client, img_path, ref_b64, ref_media)
        return img_path, rel, result

    with ThreadPoolExecutor(max_workers=5) as executor:
        futures = {executor.submit(_analyze, p): p for p in images}
        for future in as_completed(futures):
            img_path, rel, result = future.result()
            status = result.get("status", "normal")
            confidence = float(result.get("confidence", 0.0))
            reason = result.get("reason", "")
            results_map[img_path] = {"path": img_path, "rel": rel, "status": status, "reason": reason, "confidence": confidence}

            completed += 1
            status_line.caption(f"Checked {completed} / {n}")
            progress_bar.progress(completed / n)

            if status != "normal" and confidence >= threshold:
                icon = STATUS_ICON.get(status, "⚠️")
                label = STATUS_LABEL.get(status, status)
                log_lines.append(f"{icon} `{rel}` — **{label}** ({confidence:.0%}) — {reason}")
                log.markdown("\n\n".join(log_lines[-20:]))

    # Preserve original order
    results = [results_map[p] for p in images if p in results_map]
    status_line.empty()
    flagged = [r for r in results if r["status"] != "normal" and r["confidence"] >= threshold]

    st.session_state.results = results
    st.session_state.flagged = flagged
    st.session_state.review_idx = 0
    st.session_state.decisions = {}

    if flagged:
        st.success(f"Found **{len(flagged)} flagged** out of {n} images. Starting review...")
        time.sleep(1.2)
        st.session_state.phase = "reviewing"
    else:
        st.success(f"All {n} images look clean — no anomalies detected above the threshold.")
        st.session_state.phase = "done"

    st.rerun()


def render_review():
    flagged = st.session_state.flagged
    idx = st.session_state.review_idx
    decisions = st.session_state.decisions
    total = len(flagged)

    if idx >= total:
        st.session_state.phase = "done"
        st.rerun()
        return

    # Header row
    col_title, col_skip = st.columns([3, 2])
    with col_title:
        st.title(f"Review  {idx + 1} / {total}")
    with col_skip:
        st.write("")
        if st.button("Keep all remaining →", use_container_width=True):
            for item in flagged[idx:]:
                decisions[item["path"]] = "keep"
            st.session_state.phase = "done"
            st.rerun()

    st.progress((idx) / total)

    item = flagged[idx]

    # Image
    try:
        img = Image.open(item["path"])
        st.image(img, use_container_width=True)
    except Exception as e:
        st.warning(f"Could not display image: {e}")

    # Metadata
    icon = STATUS_ICON.get(item["status"], "⚠️")
    label = STATUS_LABEL.get(item["status"], item["status"])
    m1, m2, m3 = st.columns(3)
    m1.metric("Status", f"{icon} {label}")
    m2.metric("Confidence", f"{item['confidence']:.0%}")
    m3.metric("File", Path(item["rel"]).name)
    st.caption(f"**Reason:** {item['reason']}")

    st.write("")

    # Decision buttons
    b1, b2 = st.columns(2)
    with b1:
        if st.button("🗑️  Remove", type="primary", use_container_width=True):
            decisions[item["path"]] = "remove"
            st.session_state.review_idx = idx + 1
            st.rerun()
    with b2:
        if st.button("✓  Keep", use_container_width=True):
            decisions[item["path"]] = "keep"
            st.session_state.review_idx = idx + 1
            st.rerun()

    # Running tally
    removed_so_far = sum(1 for v in decisions.values() if v == "remove")
    st.caption(f"Reviewed {len(decisions)} / {total} — {removed_so_far} marked for removal so far")


def render_done():
    images = st.session_state.images
    decisions = st.session_state.decisions
    extract_dir = st.session_state.extract_dir

    to_remove = {p for p, d in decisions.items() if d == "remove"}
    kept = len(images) - len(to_remove)

    st.title("Done")

    c1, c2, c3 = st.columns(3)
    c1.metric("Total images", len(images))
    c2.metric("Kept", kept)
    c3.metric("Removed", len(to_remove))

    st.divider()

    if to_remove:
        with st.expander(f"Removed images ({len(to_remove)})"):
            for p in sorted(to_remove):
                st.write(f"🗑️  {os.path.relpath(p, extract_dir)}")

    # Build clean zip
    with st.spinner("Building clean archive..."):
        clean_buf = io.BytesIO()
        with zipfile.ZipFile(clean_buf, "w", zipfile.ZIP_DEFLATED, compresslevel=6) as zf:
            for root, _, files in os.walk(extract_dir):
                for fname in files:
                    full = os.path.join(root, fname)
                    if full not in to_remove:
                        zf.write(full, os.path.relpath(full, extract_dir))
        clean_buf.seek(0)
        clean_data = clean_buf.read()

    st.download_button(
        "⬇️  Download clean archive",
        data=clean_data,
        file_name=f"{st.session_state.get('archive_stem', 'archive')}_cleaned.zip",
        mime="application/zip",
        type="primary",
        use_container_width=True,
    )

    if to_remove:
        rej_buf = io.BytesIO()
        with zipfile.ZipFile(rej_buf, "w", zipfile.ZIP_DEFLATED) as zf:
            for p in to_remove:
                if os.path.exists(p):
                    zf.write(p, os.path.relpath(p, extract_dir))
        rej_buf.seek(0)

        st.download_button(
            "⬇️  Download rejected images",
            data=rej_buf.read(),
            file_name=f"{st.session_state.get('archive_stem', 'archive')}_rejected.zip",
            mime="application/zip",
            use_container_width=True,
        )

    st.divider()
    if st.button("↩  Start over", use_container_width=True):
        reset()


# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    st.set_page_config(page_title="Screen Cleaner", page_icon="🖥️", layout="centered")
    init_state()

    with st.sidebar:
        st.header("Configuration")
        env_key = os.environ.get("ANTHROPIC_API_KEY", "")
        if env_key:
            st.success("API key from environment ✓")
        else:
            key_input = st.text_input("Anthropic API Key", type="password", placeholder="sk-ant-...")
            if key_input:
                st.session_state.api_key = key_input

        if st.session_state.phase != "setup":
            st.divider()
            if st.button("↩  Start over", use_container_width=True):
                reset()

    phase = st.session_state.phase
    if phase == "setup":
        render_setup()
    elif phase == "analyzing":
        render_analysis()
    elif phase == "reviewing":
        render_review()
    elif phase == "done":
        render_done()


if __name__ == "__main__":
    main()
