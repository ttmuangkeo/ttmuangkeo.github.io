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
        self.scope_text = {}   # scope name -> text
        self.scope_links = {}  # scope name -> [attr dicts of <a>]
        self.scope_elems = {}  # scope name -> [(tag, attr dict)] in document order
        self._stack = []       # (tag, scope or None)

    def _scopes(self):
        return {s for _, s in self._stack if s}

    def handle_endtag(self, tag):
        for i in range(len(self._stack) - 1, -1, -1):
            if self._stack[i][0] == tag:
                del self._stack[i:]
                break

    def handle_data(self, data):
        for s in self._scopes():
            self.scope_text[s] = self.scope_text.get(s, "") + data

    def handle_starttag(self, tag, attrs):
        a = {k: (v if v is not None else "") for k, v in attrs}
        scope = "header" if tag == "header" else (
            a["id"] if tag == "section" and "id" in a else None)
        if tag not in ("meta", "link", "img", "br", "hr", "input", "source"):
            self._stack.append((tag, scope))
        for s in self._scopes():
            self.scope_elems.setdefault(s, []).append((tag, a))
        if tag == "a":
            for s in self._scopes():
                self.scope_links.setdefault(s, []).append(a)
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


IMG_DIR = ROOT / "assets" / "img"


def test_images_budget():
    jpgs = sorted(IMG_DIR.glob("*.jpg"))
    big = [f"{p.name} {p.stat().st_size // 1024}KB" for p in jpgs
           if p.stat().st_size > 400 * 1024]
    total = sum(p.stat().st_size for p in (ROOT / "assets").rglob("*") if p.is_file())
    ok = bool(jpgs) and not big and total <= 2.5 * 1024 * 1024
    check("images_budget", ok,
          f"{len(jpgs)} jpgs; over 400KB: {big}; assets total {total // 1024}KB (max 2560KB)")


def jpeg_app_segments(data):
    """Yield (marker, payload) for each marker segment before start-of-scan."""
    if data[:2] != b"\xff\xd8":
        raise ValueError("not a JPEG")
    i = 2
    while i + 4 <= len(data):
        if data[i] != 0xFF:
            raise ValueError(f"bad marker at {i}")
        m = data[i + 1]
        if m == 0xFF:
            i += 1
            continue
        if m == 0xDA or m == 0xD9:  # SOS / EOI: stop, never scan entropy data
            return
        if 0xD0 <= m <= 0xD8 or m == 0x01:
            i += 2
            continue
        n = int.from_bytes(data[i + 2:i + 4], "big")
        yield m, data[i + 4:i + 2 + n]
        i += 2 + n


def test_images_no_exif():
    bad = []
    jpgs = sorted(IMG_DIR.glob("*.jpg"))
    for p in jpgs:
        try:
            for m, payload in jpeg_app_segments(p.read_bytes()):
                if m == 0xE1:
                    bad.append(f"{p.name}: APP1")
                elif 0xE0 <= m <= 0xEF and b"GPS" in payload:
                    bad.append(f"{p.name}: GPS in APP{m - 0xE0}")
        except ValueError as e:
            bad.append(f"{p.name}: {e}")
    check("images_no_exif", jpgs and not bad, f"{bad or 'no jpgs found'}")


def pdf_unescape(lit):
    """Decode the body of a PDF (...) literal string to bytes."""
    esc = {ord("n"): 10, ord("r"): 13, ord("t"): 9, ord("b"): 8, ord("f"): 12}
    out, i = bytearray(), 0
    while i < len(lit):
        c = lit[i]
        if c != 0x5C:
            out.append(c)
            i += 1
            continue
        i += 1
        if i >= len(lit):
            break
        c = lit[i]
        if 0x30 <= c <= 0x37:
            j = i
            while j < len(lit) and j < i + 3 and 0x30 <= lit[j] <= 0x37:
                j += 1
            out.append(int(lit[i:j], 8) & 0xFF)
            i = j
            continue
        if c in (10, 13):
            i += 1
            continue
        out.append(esc.get(c, c))
        i += 1
    return bytes(out)


def pdf_text(data):
    """Best-effort stdlib text extraction: inflate streams, decode Tj/TJ strings
    through each font's ToUnicode CMap (hex 2-byte codes) or as literals."""
    import zlib
    objs, streams = {}, []
    for m in re.finditer(rb"(\d+) \d+ obj(.*?)endobj", data, re.S):
        body = m.group(2)
        sm = re.search(rb"stream\r?\n(.*?)endstream", body, re.S)
        raw = sm.group(1) if sm else b""
        try:
            raw = zlib.decompress(raw)
        except zlib.error:
            pass
        objs[int(m.group(1))] = (body[:sm.start()] if sm else body, raw)
        streams.append(raw)
    cmaps = {}
    for num, (d, _) in objs.items():
        tu = re.search(rb"/ToUnicode (\d+) 0 R", d)
        if tu and int(tu.group(1)) in objs:
            cm = {}
            txt = objs[int(tu.group(1))][1].decode("latin-1")
            for blk in re.findall(r"beginbfchar(.*?)endbfchar", txt, re.S):
                for a, b in re.findall(r"<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>", blk):
                    cm[int(a, 16)] = bytes.fromhex(b).decode("utf-16-be", "replace")
            for blk in re.findall(r"beginbfrange(.*?)endbfrange", txt, re.S):
                for a, b, c in re.findall(
                        r"<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>", blk):
                    for k in range(int(a, 16), int(b, 16) + 1):
                        cm[k] = chr(int(c, 16) + k - int(a, 16))
            cmaps[int(tu.group(1))] = cm
    fontmaps = {}
    for _, (d, _r) in objs.items():
        for name, ref in re.findall(rb"/(F\d+) (\d+) 0 R", d):
            if int(ref) in objs:
                tu = re.search(rb"/ToUnicode (\d+) 0 R", objs[int(ref)][0])
                if tu and int(tu.group(1)) in cmaps:
                    fontmaps.setdefault(name.decode(), cmaps[int(tu.group(1))])
    out = []
    tok = re.compile(rb"/(F\d+) [\d.]+ Tf|<([0-9A-Fa-f\s]*)>|\(((?:\\.|[^\\)])*)\)|(ET)")
    for raw in streams:
        if b"BT" not in raw:
            continue
        cm = {}
        for m in tok.finditer(raw):
            if m.group(1):
                cm = fontmaps.get(m.group(1).decode(), {})
            elif m.group(2) is not None:
                h = re.sub(rb"\s", b"", m.group(2)).decode()
                for k in range(0, len(h) - 3, 4):
                    c = int(h[k:k + 4], 16)
                    out.append(cm.get(c, "\ufffd"))
            elif m.group(3) is not None:
                b = pdf_unescape(m.group(3))
                if cm:
                    for k in range(0, len(b) - 1, 2):
                        out.append(cm.get(int.from_bytes(b[k:k + 2], "big"), "\ufffd"))
                else:
                    out.append(b.decode("latin-1"))
            elif m.group(4):
                out.append("\n")
    return "".join(out), b"\n".join(streams)


def test_resume_public():
    p = ROOT / "assets" / "Tim_Muangkeo_Resume.pdf"
    if not p.exists():
        check("resume_public", False, "assets/Tim_Muangkeo_Resume.pdf missing")
        return
    data = p.read_bytes()
    text, blob = pdf_text(data)
    pat = re.compile(r"206[-.\s]?578|578[-.\s]?2888|907[-.\s]?570|570[-.\s]?4914")
    has_email = "tim.muangkeo@gmail.com" in text
    leaked = pat.search(text) or pat.search((data + blob).decode("latin-1"))
    check("resume_public", has_email and not leaked,
          f"email found={has_email}; phone found={bool(leaked)}")


def test_hero_content():
    idx = parse_index()
    hero = idx.scope_text.get("trailhead", "").lower()
    hero_links = idx.scope_links.get("trailhead", [])
    head_links = idx.scope_links.get("header", [])
    resume = "assets/Tim_Muangkeo_Resume.pdf"
    problems = []
    if "just a kid from alaska" not in hero:
        problems.append("hero missing headline")
    if "61.2181° n, 149.9003° w" not in hero:
        problems.append("hero missing coordinates")
    if not any(l.get("href") == "mailto:tim.muangkeo@gmail.com" for l in hero_links):
        problems.append("hero missing mailto link")
    if not any(l.get("href") == resume and "download" in l for l in hero_links):
        problems.append("hero missing resume download link")
    if not any(l.get("href") == resume for l in head_links):
        problems.append("header missing resume link")
    check("hero_content", not problems, "; ".join(problems))


ROUTE_ORDER = ["uaa", "ga", "mercutio", "penwizard", "moxi-support",
               "goodleap", "moxi-senior", "moxi-swe"]


def test_route_stops():
    idx = parse_index()
    stops = [a for _, a in idx.scope_elems.get("route", [])
             if "stop" in a.get("class", "").split()]
    order = [a.get("data-stop") for a in stops]
    classes = {a.get("data-stop"): a.get("class", "").split() for a in stops}
    text = " ".join(idx.scope_text.get("route", "").split()).lower()
    problems = []
    if order != ROUTE_ORDER:
        problems.append(f"stop order {order}, want {ROUTE_ORDER}")
    if "stop--detour" not in classes.get("goodleap", []):
        problems.append("goodleap lacks stop--detour")
    if "stop--here" not in classes.get("moxi-swe", []):
        problems.append("moxi-swe lacks stop--here")
    for phrase in ("4-month contract", "you are here"):
        if phrase not in text:
            problems.append(f"route text missing '{phrase}'")
    check("route_stops", not problems, "; ".join(problems))


def css_rules(css):
    """Yield (selector, declarations) for every innermost {...} block,
    flattening @media/@supports nesting. Comments are stripped first."""
    css = re.sub(r"/\*.*?\*/", "", css, flags=re.S)
    stack, start = [], 0
    for i, ch in enumerate(css):
        if ch == "{":
            stack.append((css[start:i].strip(), i))
            start = i + 1
        elif ch == "}":
            if stack:
                sel, open_i = stack.pop()
                body = css[open_i + 1:i]
                if "{" not in body and not sel.startswith("@"):
                    yield sel, body
            start = i + 1
        elif ch == ";" and not stack:
            start = i + 1


HIDES = re.compile(r"(?:^|;)\s*(?:opacity\s*:\s*0(?:\.0*)?\s*(?:!important\s*)?(?:;|$)"
                   r"|visibility\s*:\s*hidden)", re.I)


def test_no_hidden_without_js():
    css = (ROOT / "assets" / "css" / "site.css").read_text(encoding="utf-8")
    bad = []
    for sel, body in css_rules(css):
        if not HIDES.search(body.strip()):
            continue
        for part in sel.split(","):
            part = part.strip()
            if re.search(r"\.(?:reveal|stop)\b", part) and not part.startswith(".js"):
                bad.append(part)
    check("no_hidden_without_js", not bad,
          f"hides .reveal/.stop without a .js guard: {bad}")


def main():
    for name, fn in list(globals().items()):
        if name.startswith("test_") and callable(fn):
            fn()
    sys.exit(1 if any(not ok for _, ok, _ in RESULTS) else 0)


if __name__ == "__main__":
    main()
