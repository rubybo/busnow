import glob
import os
import sys

import pymupdf

out_dir = os.path.join(os.path.dirname(__file__), "..", "data", "pdf-text")
os.makedirs(out_dir, exist_ok=True)
downloads = os.environ.get("ATP_PDF_DIR", os.path.expanduser(r"~\Downloads"))
paths = sorted(glob.glob(os.path.join(downloads, "Маршрут*.pdf")))
if not paths:
    print(f"No PDFs in {downloads}", file=sys.stderr)
    sys.exit(1)

for path in paths:
    doc = pymupdf.open(path)
    text = "\n".join(page.get_text() for page in doc)
    base = os.path.splitext(os.path.basename(path))[0]
    safe = "".join(c if c.isalnum() or c in " _-" else "_" for c in base)[:120]
    out_path = os.path.join(out_dir, safe + ".txt")
    with open(out_path, "w", encoding="utf-8") as f:
        f.write(text)
    print(f"{len(text):5}  {safe[:60]}")
