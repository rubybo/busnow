from pathlib import Path
import re
import pymupdf

DOWNLOADS = Path(r"C:\Users\User\Downloads")
for pdf in sorted(DOWNLOADS.glob("Маршрут*.pdf")):
    m = re.search(r"№\s*([0-9]+[АA]?)", pdf.name)
    code = m.group(1).replace("A", "А") if m else "?"
    if "21А" in pdf.name:
        code = "21А"
    doc = pymupdf.open(pdf)
    tables = sum(len(p.find_tables().tables) for p in doc)
    print(f"{code:6} tables={tables} pages={doc.page_count} {pdf.name[:55]}")
