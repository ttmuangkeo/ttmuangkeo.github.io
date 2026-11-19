"""Stdlib site checker. Run from anywhere: python3 -I _tests/check_site.py

Prints `PASS name` / `FAIL name: reason`; exits 1 on any failure.
Later tasks append `test_*` functions; main() runs them in definition order.
"""
import re
import sys
from html.parser import HTMLParser
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
RESULTS = []


def check(name, ok, reason=""):
    RESULTS.append((name, bool(ok), reason))
    print(f"PASS {name}" if ok else f"FAIL {name}: {reason}")


def load_index():
    p = ROOT / "index.html"
    return p.read_text(encoding="utf-8") if p.exists() else ""


class HTMLIndex(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.ids = set()
        self.imgs = []
        self.links = []
        self.metas = {}

    def handle_starttag(self, tag, attrs):
        a = {k: (v if v is not None else "") for k, v in attrs}
        if "id" in a:
            self.ids.add(a["id"])
        if tag == "img":
            self.imgs.append(a)
        if tag in ("a", "link") and "href" in a:
            self.links.append(a["href"])
        if tag == "meta":
            key = a.get("property") or a.get("name")
            if key and "content" in a:
                self.metas[key] = a["content"]


def parse_index():
    p = HTMLIndex()
    p.feed(load_index())
    return p


SKIP_DIRS = {".git", ".superpowers"}
BINARY_EXT = {".jpg", ".jpeg", ".png", ".gif", ".pdf", ".woff", ".woff2",
              ".ico", ".webp", ".ttf", ".eot", ".otf", ".mp4", ".zip"}


def iter_text_files():
    for p in sorted(ROOT.rglob("*")):
        rel = p.relative_to(ROOT)
        if rel.parts[0] in SKIP_DIRS or not p.is_file():
            continue
        if p.suffix.lower() in BINARY_EXT:
            continue
        try:
            yield rel, p.read_text(encoding="utf-8")
        except (UnicodeDecodeError, OSError):
            continue


SVG_GEOM = re.compile(r'\b(?:d|viewBox|points|transform)\s*=\s*("[^"]*"|\'[^\']*\')')
PHONE = re.compile(r"\(?\d{3}\)?[-.\s]\d{3}[-.\s]\d{4}")


def test_old_template_gone():
    old = ["about.html", "blog.html", "portfolio.html", "services.html",
           "contact.html", "css", "scss", "js", "fonts", "images"]
    present = [n for n in old if (ROOT / n).exists()]
    check("old_template_gone", not present, f"still present: {present}")


def test_sections_present():
    need = {"trailhead", "route", "features", "log", "basecamp", "offtrail", "contact"}
    missing = sorted(need - parse_index().ids)
    check("sections_present", not missing, f"missing ids: {missing}")


def test_no_phone():
    hits = []
    for rel, text in iter_text_files():
        if PHONE.search(SVG_GEOM.sub("", text)):
            hits.append(str(rel))
    check("no_phone", not hits, f"phone-like number in: {hits}")


def main():
    for name, fn in list(globals().items()):
        if name.startswith("test_") and callable(fn):
            fn()
    sys.exit(1 if any(not ok for _, ok, _ in RESULTS) else 0)


if __name__ == "__main__":
    main()
