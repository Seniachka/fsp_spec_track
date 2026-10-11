from pathlib import Path
from pypdf import PdfReader

src = Path(r"C:\Users\colde\Documents\fsp_spec_track") / "ФСП спец. трек ТЗ.pdf"
reader = PdfReader(str(src))
parts = [f"PAGES {len(reader.pages)}\n"]
for i, page in enumerate(reader.pages):
    text = page.extract_text() or ""
    parts.append(f"\n\n===== PAGE {i + 1} =====\n")
    parts.append(text)
out = Path(r"C:\Users\colde\Documents\fsp_spec_track\docs\_tz_extract.txt")
out.write_text("".join(parts), encoding="utf-8")
print("pages", len(reader.pages), "chars", out.stat().st_size)
