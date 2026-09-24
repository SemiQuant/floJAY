#!/usr/bin/env python3
"""Build floJAY.html: inline SheetJS, src/core.js, assets/report-extras.css and assets/sq.png into src/app.html.

Usage: python3 build.py
SheetJS is downloaded once into vendor/ (Apache-2.0, https://sheetjs.com).
"""
import base64, pathlib, urllib.request, sys

ROOT = pathlib.Path(__file__).resolve().parent
SHEETJS_URL = "https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js"
VENDOR = ROOT / "vendor" / "xlsx.full.min.js"
OUT = ROOT / "floJAY.html"

def main():
    if not VENDOR.exists():
        VENDOR.parent.mkdir(exist_ok=True)
        print("downloading", SHEETJS_URL)
        urllib.request.urlretrieve(SHEETJS_URL, VENDOR)
    xlsx = VENDOR.read_text(encoding="utf-8")
    core = (ROOT / "src" / "core.js").read_text(encoding="utf-8")
    html = (ROOT / "src" / "app.html").read_text(encoding="utf-8")
    css = (ROOT / "assets" / "report-extras.css").read_text(encoding="utf-8")
    logo = "data:image/png;base64," + base64.b64encode((ROOT / "assets" / "sq.png").read_bytes()).decode("ascii")
    for marker, code in (("<!--INLINE:css-->", "<style>\n" + css + "\n</style>"), ("<!--INLINE:logo-->", logo)):
        if marker not in html:
            sys.exit("marker missing: " + marker)
        html = html.replace(marker, code)
    for marker, code in (("<!--INLINE:xlsx-->", xlsx), ("<!--INLINE:core-->", core)):
        if marker not in html:
            sys.exit("marker missing: " + marker)
        if "</script" in code:
            sys.exit("inlined code contains </script>")
        html = html.replace(marker, "<script>\n" + code + "\n</script>")
    OUT.write_text(html, encoding="utf-8")
    print("wrote", OUT, f"({OUT.stat().st_size/1024:.0f} KB)")

if __name__ == "__main__":
    main()
