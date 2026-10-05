from pathlib import Path
import pymupdf

source = Path("attached_assets/0_Print_Quiz_-_M7_B1_Maintenance_Practices4_1791205890309.pdf")
output_dir = Path(".agents/outputs")
output_dir.mkdir(parents=True, exist_ok=True)

document = pymupdf.open(source)
print(f"pages={document.page_count}; encrypted={document.is_encrypted}")
for page in document:
    pixmap = page.get_pixmap(matrix=pymupdf.Matrix(1.5, 1.5), alpha=False)
    output = output_dir / f"m7b1-page-{page.number + 1}.png"
    pixmap.save(output)
    print(
        f"page={page.number + 1}; text_chars={len(page.get_text())}; "
        f"embedded_images={len(page.get_images(full=True))}; rendered={output}"
    )
document.close()
