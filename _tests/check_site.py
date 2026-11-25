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
    """The game homepage."""
    p = ROOT / "index.html"
    return p.read_text(encoding="utf-8") if p.exists() else ""


def load_story():
    """The full-text Field Manual page (story mode)."""
    p = ROOT / "story" / "index.html"
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
        self.scope_h3 = {}     # scope name -> [h3 text]
        self.scope_imgs = {}   # scope name -> [img attr dicts]
        self.icons = []        # <link rel="icon"> hrefs
        self.entries = []      # details.entry: {"open": bool, "summary": str} in order
        self._entry = None
        self._in_summary = False
        self._h3 = None
        self._stack = []       # (tag, scope or None)

    def _scopes(self):
        return {s for _, s in self._stack if s}

    def handle_endtag(self, tag):
        if tag == "summary":
            self._in_summary = False
        if tag == "details":
            self._entry = None
        if tag == "h3" and self._h3 is not None:
            text = " ".join("".join(self._h3[1]).split())
            for s in self._scopes():
                self.scope_h3.setdefault(s, []).append(text)
            self._h3 = None
        for i in range(len(self._stack) - 1, -1, -1):
            if self._stack[i][0] == tag:
                del self._stack[i:]
                break

    def handle_data(self, data):
        if self._in_summary and self._entry is not None:
            self._entry["summary"] += data
        if self._h3 is not None:
            self._h3[1].append(data)
        for s in self._scopes():
            self.scope_text[s] = self.scope_text.get(s, "") + data

    def handle_starttag(self, tag, attrs):
        a = {k: (v if v is not None else "") for k, v in attrs}
        scope = "header" if tag == "header" else (
            a["id"] if tag == "section" and "id" in a else None)
        if tag == "h3":
            self._h3 = (tag, [])
        if tag == "details" and "entry" in a.get("class", "").split():
            self._entry = {"open": "open" in a, "summary": ""}
            self.entries.append(self._entry)
        if tag == "summary" and self._entry is not None:
            self._in_summary = True
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
            for s in self._scopes():
                self.scope_imgs.setdefault(s, []).append(a)
        if tag == "link" and "icon" in a.get("rel", "").split():
            self.icons.append(a.get("href", ""))
        if tag in ("a", "link") and "href" in a:
            self.links.append(a["href"])
        if tag == "meta":
            key = a.get("property") or a.get("name")
            if key and "content" in a:
                self.metas[key] = a["content"]


def parse_html(text):
    p = HTMLIndex()
    p.feed(text)
    return p


def parse_index():
    """Parses the story page: every content test checks the Field Manual text."""
    return parse_html(load_story())


SKIP_DIRS = {".git", ".superpowers"}
BINARY_EXT = {".jpg", ".jpeg", ".png", ".gif", ".pdf", ".woff", ".woff2",
              ".ico", ".webp", ".ttf", ".eot", ".otf", ".mp4", ".zip"}


def iter_text_files():
    for p in sorted(ROOT.rglob("*")):
        rel = p.relative_to(ROOT)
        if rel.parts[0] in SKIP_DIRS or not p.is_file():
            continue
        if rel.parts[:2] == ("assets", "vendor"):  # third-party minified code, not site copy
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


def test_resume_is_current():
    """The downloadable resume is the Nov 2026 Software Engineer version."""
    p = ROOT / "assets" / "Tim_Muangkeo_Resume.pdf"
    text = pdf_text(p.read_bytes())[0] if p.exists() else ""
    flat = " ".join(text.split())
    problems = [f"missing {w!r}" for w in ("November 2026", "500K+", "Software Engineer") if w not in flat]
    if "Present" in flat:
        problems.append("still says Present")
    check("resume_is_current", not problems, "; ".join(problems))


def test_hero_content():
    idx = parse_index()
    hero = idx.scope_text.get("trailhead", "").lower()
    hero_links = idx.scope_links.get("trailhead", [])
    head_links = idx.scope_links.get("header", [])
    resume = "../assets/Tim_Muangkeo_Resume.pdf"
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
    for phrase in ("4-month contract",):
        if phrase not in text:
            problems.append(f"route text missing '{phrase}'")
    for phrase in ("you are here", "present"):
        if phrase in text:
            problems.append(f"route text still says '{phrase}' (quiet end date)")
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


FEATURE_TITLES = ["Production escalations", "Zero-loss data migrations",
                  "AI-powered triage & review", "Self-serve tooling & automation"]


def test_features():
    idx = parse_index()
    elems = idx.scope_elems.get("features", [])
    cards = [a for _, a in elems if "feature" in a.get("class", "").split()]
    groups = [a for tag, a in elems if tag == "dt"]
    text = " ".join(idx.scope_text.get("features", "").split())
    problems = []
    if len(cards) != 4:
        problems.append(f"{len(cards)} .feature cards, want 4")
    if idx.scope_h3.get("features", []) != FEATURE_TITLES:
        problems.append(f"h3 texts {idx.scope_h3.get('features', [])}")
    for phrase in ("500K+", "zero data loss", "Atlassian MCP", "24 hours", "1\u20132 hours"):
        if phrase not in text:
            problems.append(f"missing '{phrase}'")
    if len(groups) < 6:
        problems.append(f"{len(groups)} toolkit groups (dt), want >= 6")
    check("features", not problems, "; ".join(problems))


TIMELINE = [
    ("Software Engineer", "MoxiWorks", "Jun 2024 \u2013 Nov 2026"),
    ("Senior Application Support Engineer", "MoxiWorks", "Mar 2022 \u2013 Jun 2024"),
    ("Software Support Engineer", "GoodLeap", "Jun 2021 \u2013 Mar 2022"),
    ("Application Support Engineer", "MoxiWorks", "Dec 2018 \u2013 Jun 2021"),
    ("Web Developer", "Penwizard", "2018"),
    ("Junior Web Developer (contract)", "Mercutio", "2017"),
    ("Software Engineering Immersive", "General Assembly", None),
]
VERSIONS = ["v4.0", "v3.1", "v3.0", "v2.0", "v1.1", "v1.0", "v0.9"]


def test_timeline_facts():
    idx = parse_index()
    entries = idx.entries
    problems = []
    if len(entries) != len(TIMELINE):
        problems.append(f"{len(entries)} details.entry, want {len(TIMELINE)}")
    for i, (e, (role, co, dates)) in enumerate(zip(entries, TIMELINE)):
        s = " ".join(e["summary"].split())
        want = [role, co] + ([dates] if dates else [])
        for w in want:
            if w not in s:
                problems.append(f"entry {i + 1} summary {s!r} missing {w!r}")
        if i < len(VERSIONS) and VERSIONS[i] not in s:
            problems.append(f"entry {i + 1} missing version {VERSIONS[i]}")
    if entries and not entries[0]["open"]:
        problems.append("first entry not open")
    if any(e["open"] for e in entries[1:]):
        problems.append("only the first entry should be open")
    links = idx.scope_links.get("log", [])
    if not any(a.get("href") == "../assets/Tim_Muangkeo_Resume.pdf" and "download" in a for a in links):
        problems.append("no resume download link in #log")
    check("timeline_facts", not problems, "; ".join(problems))


def test_basecamp():
    idx = parse_index()
    text = idx.scope_text.get("basecamp", "")
    links = [a.get("href") for a in idx.scope_links.get("basecamp", [])]
    problems = []
    if "https://www.sitrepp.io" not in links:
        problems.append("no link to https://www.sitrepp.io")
    for w in ("Supabase", "Mapbox", "Flutter", "Claude"):
        if w not in text:
            problems.append(f"missing {w}")
    check("basecamp", not problems, "; ".join(problems))


def test_offtrail():
    idx = parse_index()
    imgs = idx.scope_imgs.get("offtrail", [])
    problems = []
    if "Summit Peak Venture" not in idx.scope_text.get("offtrail", ""):
        problems.append("missing Summit Peak Venture")
    if not 6 <= len(imgs) <= 8:
        problems.append(f"{len(imgs)} imgs, want 6-8")
    if any(i.get("loading") != "lazy" for i in imgs):
        problems.append("not all imgs loading=lazy")
    check("offtrail", not problems, "; ".join(problems))


def test_contact_links():
    idx = parse_index()
    hrefs = [a.get("href") for a in idx.scope_links.get("contact", [])]
    want = ["mailto:tim.muangkeo@gmail.com?subject=Let%27s%20talk%20%E2%80%94%20from%20your%20site",
            "https://www.linkedin.com/in/ttmuangkeo", "https://github.com/ttmuangkeo",
            "../assets/Tim_Muangkeo_Resume.pdf"]
    missing = [w for w in want if w not in hrefs]
    check("contact_links", not missing, f"missing {missing}")


def test_meta_tags():
    problems = []
    pages = (("home", parse_html(load_index()), "https://ttmuangkeo.github.io/", "assets/img/favicon.svg"),
             ("story", parse_index(), "https://ttmuangkeo.github.io/story/", "../assets/img/favicon.svg"))
    for name, idx, url, icon in pages:
        m = idx.metas
        problems += [f"{name}: missing {k}" for k in ("description", "og:title", "og:description") if not m.get(k)]
        for k, v in (("og:image", "https://ttmuangkeo.github.io/assets/img/og.jpg"),
                     ("og:url", url),
                     ("twitter:card", "summary_large_image")):
            if m.get(k) != v:
                problems.append(f"{name}: {k}={m.get(k)!r}, want {v!r}")
        if icon not in idx.icons:
            problems.append(f"{name}: no <link rel=icon> to {icon}")
    check("meta_tags", not problems, "; ".join(problems))


def test_all_imgs_have_alt_and_size():
    bad = [i.get("src") for i in parse_index().imgs
           if not i.get("alt", "").strip() or not i.get("width") or not i.get("height")]
    check("all_imgs_have_alt_and_size", not bad, f"bad imgs: {bad}")


def test_404_exists():
    p = ROOT / "404.html"
    ok = p.exists()
    f = HTMLIndex()
    if ok:
        f.feed(p.read_text(encoding="utf-8"))
    check("404_exists", ok and "/" in f.links and "/story/" in f.links,
          "404.html missing, or lacks links to / and /story/")


def test_route_years():
    html = load_story()
    m = re.search(r'<section id="route".*?</section>', html, re.S)
    sec = m.group(0) if m else ""
    want = {"uaa": "2012\u20132017", "mercutio": "2017", "penwizard": "2018",
            "moxi-support": "Dec 2018\u2013Jun 2021", "goodleap": "Jun 2021\u2013Mar 2022",
            "moxi-senior": "Mar 2022\u2013Jun 2024", "moxi-swe": "Jun 2024\u2013Nov 2026"}
    problems = []
    blocks = {}
    for b in re.finditer(r'<li class="stop[^"]*" data-stop="([^"]+)">(.*?)</li>', sec, re.S):
        blocks[b.group(1)] = b.group(2)
    for k, years in want.items():
        if years not in blocks.get(k, ""):
            problems.append(f"{k} missing {years!r}")
    if re.search(r"20\d\d", blocks.get("ga", "20")):
        problems.append("ga should have no year")
    check("route_years", not problems, "; ".join(problems))


def test_inits_guarded():
    js = (ROOT / "assets" / "js" / "site.js").read_text(encoding="utf-8")
    m = re.search(r"DOMContentLoaded.*", js, re.S)
    body = m.group(0) if m else ""
    problems = []
    pos = {n: body.find(n + "(") for n in ("initReveal", "initRoute", "initNav")}
    if min(pos.values()) < 0:
        problems.append("missing init call")
    elif pos["initReveal"] > pos["initRoute"]:
        problems.append("initReveal must run before initRoute")
    for n in pos:
        if not re.search(r"try\s*\{[^{}]*\b" + n + r"\(", body):
            problems.append(f"{n} not inside try")
    check("inits_guarded", not problems, "; ".join(problems))


def test_worked_at_logos():
    html = load_story()
    m = re.search(r'<ul class="worked-at"[^>]*>(.*?)</ul>', html, re.S)
    problems = []
    if not m:
        problems.append("no ul.worked-at strip")
    else:
        strip = m.group(1)
        for co, path in (("MoxiWorks", "../assets/img/logos/moxiworks.svg"),
                         ("GoodLeap", "../assets/img/logos/goodleap.svg")):
            if not re.search(r'<img[^>]*src="' + re.escape(path) + r'"[^>]*alt="' + co + r'"', strip):
                problems.append(f"{co} logo img with alt missing")
            if not (ROOT / path.replace('../', '')).exists():
                problems.append(f"{path} missing")
        if re.search(r"trusted by", html, re.I):
            problems.append('"Trusted by" wording implies endorsement')
    if "Goodleap" in html:  # the brand is spelled GoodLeap
        problems.append("misspelled Goodleap in index.html")
    check("worked_at_logos", not problems, "; ".join(problems))


def test_route_logos():
    html = load_story()
    expected = {"moxi-support": "moxiworks", "goodleap": "goodleap",
                "moxi-senior": "moxiworks", "moxi-swe": "moxiworks"}
    names = {"moxiworks": "MoxiWorks", "goodleap": "GoodLeap"}
    problems = []
    for stop, logo in expected.items():
        m = re.search(r'data-stop="' + stop + r'">(.*?)</li>', html, re.S)
        block = m.group(1) if m else ""
        pat = (r'<p class="stop-org[^"]*">\s*<img[^>]*src="../assets/img/logos/' + logo
               + r'\.svg"[^>]*alt="' + names[logo] + r'"')
        if not re.search(pat, block):
            problems.append(f"{stop}: no {names[logo]} logo in stop-org")
    check("route_logos", not problems, "; ".join(problems))


STORY_IDS = ("trailhead", "route", "features", "log", "basecamp", "offtrail", "contact")


def test_story_page():
    html = load_story()
    idx = parse_html(html)
    problems = []
    if not html:
        problems.append("story/index.html missing")
    missing = [i for i in STORY_IDS if i not in idx.ids]
    if missing:
        problems.append(f"missing sections {missing}")
    if re.search(r'(?:href|src)="assets/', html):
        problems.append("relative assets/ paths (need ../assets/)")
    if "/" not in idx.links:
        problems.append("no link back to /")
    check("story_page", not problems, "; ".join(problems))


def test_root_hud_static():
    html = load_index()
    idx = parse_html(html)
    hud = idx.scope_text.get("header", "")
    links = idx.scope_links.get("header", [])
    problems = []
    for t in ("Tim Muangkeo", "Software Engineer"):
        if t not in hud:
            problems.append(f"HUD missing {t!r}")
    if not any(l.get("href") == "assets/Tim_Muangkeo_Resume.pdf" and "download" in l for l in links):
        problems.append("HUD missing resume download")
    if not any(str(l.get("href", "")).startswith("mailto:tim.muangkeo@gmail.com") for l in links):
        problems.append("HUD missing mailto")
    if not any(l.get("href") == "/story/" for l in links):
        problems.append("HUD missing /story/ link")
    check("root_hud_static", not problems, "; ".join(problems))


def test_root_fallback():
    html = load_index()
    m = re.search(r'<section class="fallback".*?</section>', html, re.S)
    block = m.group(0) if m else ""
    ok = "Just a kid from Alaska" in block and 'href="/story/"' in block
    check("root_fallback", ok, "no .fallback section with intro and /story/ link")


def test_hash_redirect():
    html = load_index()
    scripts = " ".join(re.findall(r"<script(?![^>]*\bsrc=)[^>]*>(.*?)</script>", html, re.S))
    missing = [i for i in STORY_IDS if i not in scripts]
    ok = scripts and not missing and "/story/" in scripts and "location" in scripts
    check("hash_redirect", bool(ok), f"inline redirect missing ids {missing} or /story/")


def test_room_js_guarded():
    p = ROOT / "assets" / "game" / "room.js"
    js = p.read_text(encoding="utf-8") if p.exists() else ""
    i = js.find("export function init(")
    js = js[i:] if i >= 0 else ""
    problems = []
    t, c, ready = js.find("try {"), js.find("} catch"), js.find("game-ready")
    if min(t, c, ready) < 0:
        problems.append("room.js needs try/catch around init and a game-ready class")
    elif not (t < ready < c):
        problems.append("game-ready must be added inside the try, after rendering")
    check("room_js_guarded", not problems, "; ".join(problems))


def test_panel_selectors_exist():
    p = ROOT / "assets" / "game" / "panels.js"
    js = p.read_text(encoding="utf-8") if p.exists() else ""
    story = load_story()
    sels = re.findall(r"'([#\\[][^']*)'", js)
    problems = [] if sels else ["no selectors in panels.js"]
    for sel in sels:
        for tok in re.findall(r"#([a-z-]+)|\.([a-z-]+)|data-stop=\"([a-z-]+)\"", sel):
            name = next(t for t in tok if t)
            if not re.search(r'(id|class)="[^"]*\b' + re.escape(name) + r'\b|data-stop="' + re.escape(name) + '"', story):
                problems.append(f"{sel}: {name} not in story page")
    check("panel_selectors_exist", not problems, "; ".join(problems[:6]))


def test_panels_no_new_facts():
    p = ROOT / "assets" / "game" / "panels.js"
    js = p.read_text(encoding="utf-8") if p.exists() else ""
    story = load_story()
    figures = set(re.findall(r"\d+%|\b(?:19|20)\d\d\b", js))
    new = sorted(f for f in figures if f not in story)
    bad = bool(PHONE.search(js)) or "Goodleap" in js or not js
    check("panels_no_new_facts", not new and not bad, f"new figures {new}; phone/misspelling/missing={bad}")


def test_root_counter():
    html = load_index()
    m = re.search(r'class="hud-found"[^>]*>(.*?)</p>', html, re.S)
    text = re.sub(r"<[^>]+>", "", m.group(1)) if m else ""
    objects = (ROOT / "assets" / "game" / "objects.js").read_text(encoding="utf-8")
    total = len(re.findall(r"\{ id: '", objects))
    m2 = re.search(r"Found \d+/(\d+)", text)
    check("root_counter", bool(m2) and int(m2.group(1)) == total,
          f"HUD needs a Found N/{total} counter matching objects.js, got {text.strip()!r}")


def test_panel_keeps_hud_usable():
    js = (ROOT / "assets" / "game" / "room.js").read_text(encoding="utf-8")
    problems = []
    if "showModal(" in js:
        problems.append("showModal() makes the HUD inert; open panels non-modally")
    for needle in ("inert", "Escape", "Tab"):
        if needle not in js:
            problems.append(f"room.js lacks {needle} handling for the non-modal panel")
    check("panel_keeps_hud_usable", not problems, "; ".join(problems))


def test_room_stacking_isolated():
    css = (ROOT / "assets" / "game" / "room.css").read_text(encoding="utf-8")
    m = re.search(r"#room\s*\{[^}]*\}", css)
    ok = bool(m) and "isolation: isolate" in m.group(0)
    check("room_stacking_isolated", ok, "#room needs isolation: isolate so sprites never cover panels")


def test_tray_markup():
    js = (ROOT / "assets" / "game" / "room.js").read_text(encoding="utf-8")
    css = (ROOT / "assets" / "game" / "room.css").read_text(encoding="utf-8")
    problems = []
    if "tray-btn" not in js:
        problems.append("room.js does not create .tray-btn buttons")
    phone = "".join(re.findall(r"@media \(max-width: 640px\)\s*\{(.*?)\n\}", css, re.S))
    if ".tray-btn" not in phone or not re.search(r"min-height:\s*(4[4-9]|[5-9]\d|\d{3})px", phone):
        problems.append("phone media block lacks .tray-btn with min-height >= 44px")
    if "grid-template-columns: repeat(3" not in phone:
        problems.append("tray is not a 3-column grid on phones")
    if "hud-menu" not in js or "aria-expanded" not in js:
        problems.append("HUD menu toggle with aria-expanded missing")
    check("tray_markup", not problems, "; ".join(problems))


GAME_FILES = ["room.js", "sprites.js", "objects.js", "grid.js", "state.js", "panels.js", "room.css",
              "controls.js", "sky.js", "incident.js", "migration.js", "dom.js",
              "view.js", "textures.js", "props.js", "world.js", "tim.js"]


def test_game_budget():
    sizes = {f: (ROOT / "assets" / "game" / f).stat().st_size for f in GAME_FILES if (ROOT / "assets" / "game" / f).exists()}
    total = sum(sizes.values()) + (ROOT / "index.html").stat().st_size
    problems = []
    if total > 300_000:
        problems.append(f"game files total {total} bytes > 300 KB")
    for f in ("room.js", "sprites.js"):
        if sizes.get(f, 0) > 60_000:
            problems.append(f"{f} is {sizes[f]} bytes > 60 KB")
    check("game_budget", not problems and len(sizes) == len(GAME_FILES), "; ".join(problems) or f"missing files: {sizes}")


def test_game_life():
    js = (ROOT / "assets" / "game" / "room.js").read_text(encoding="utf-8")
    tim_js = (ROOT / "assets" / "game" / "tim.js").read_text(encoding="utf-8")
    css = (ROOT / "assets" / "game" / "room.css").read_text(encoding="utf-8")
    problems = []
    if "Hey, I\u2019m Tim" not in js and "Hey, I'm Tim" not in js:
        problems.append("no welcome bubble copy")
    if "'tim_wave'" not in js + tim_js or "wave" not in js.split("export function init(")[-1]:
        problems.append("Tim does not wave on load")
    if "document.hidden" not in js:
        problems.append("idle timers do not pause when the tab is hidden")
    if ".flash" not in css or "flash" not in js:
        problems.append("no camera flash overlay")
    if "steam" not in js:
        problems.append("no mug steam idle")
    check("game_life", not problems, "; ".join(problems))


def test_canonical_tags():
    problems = []
    for name, html, url in (("home", load_index(), "https://ttmuangkeo.github.io/"),
                            ("story", load_story(), "https://ttmuangkeo.github.io/story/")):
        if f'<link rel="canonical" href="{url}">' not in html:
            problems.append(f"{name} lacks canonical {url}")
    check("canonical_tags", not problems, "; ".join(problems))


def test_resume_facts():
    """Story copy agrees with the 2026-11-23 resumes (dates, numbers, quiet end date)."""
    raw = load_story()
    text = " ".join(re.sub(r"<[^>]+>", " ", raw).split()).lower()
    problems = []
    for phrase in ("8+ yrs", "jun 2024", "nov 2026", "dec 2018", "500k+", "~400", "800+", "~200",
                   "10 production code fixes", "windermere", "berkshire hathaway", "howard hanna"):
        if phrase not in text:
            problems.append(f"missing {phrase!r}")
    if "8 recoveries" not in text and "8 data recoveries" not in text:
        problems.append("missing the 8 data recoveries")
    for phrase in ("owned bugs end to end", "owned bug tickets end-to-end", "7+ yrs",
                   "google workspace \u2192 microsoft graph",
                   "about 30 a month, and fixed it end to end",          # only 5-10 a month were code fixes
                   "i review code alongside them", "i also review prds",  # quiet end date: past tense
                   "and i mentor support engineers", "users moved from ews"):
        if phrase in text:
            problems.append(f"still says {phrase!r}")
    if re.search(r'class="tag">\s*Latest', raw):
        problems.append("log still tags a role as Latest")
    if "not yet confirmed" in raw or "unconfirmed assumption" in raw:
        problems.append("Mercutio 'unconfirmed' comments remain")
    check("resume_facts", not problems, "; ".join(problems))


def test_new_blocks():
    """The office's new objects read these story blocks."""
    idx = parse_index()
    feats = idx.scope_elems.get("features", [])
    log = idx.scope_elems.get("log", [])
    has = lambda elems, cls: any(cls in a.get("class", "").split() for _, a in elems)
    problems = []
    in_numbers, boards = False, []
    for tag, a in feats:
        if tag == "ul":
            in_numbers = "numbers" in a.get("class", "").split()
        elif tag == "li" and in_numbers:
            boards.append(a.get("data-board", ""))
    if len(boards) != 4 or not all(b.strip() for b in boards):
        problems.append(f".numbers needs 4 li with data-board, got {boards}")
    if not has(feats, "toolkit"):
        problems.append("no .toolkit in #features")
    if not has(log, "clients"):
        problems.append("no .clients in #log")
    if has(feats, "integrations-wrap"):
        problems.append(".integrations-wrap should be gone")
    check("new_blocks", not problems, "; ".join(problems))


VENDOR_THREE = ROOT / "assets" / "vendor" / "three"


def test_vendor_three():
    """Three.js r170 is vendored and the homepage loads it through an import map."""
    problems = []
    lib = VENDOR_THREE / "three.module.min.js"
    src = lib.read_text(encoding="utf-8") if lib.exists() else ""
    rev = re.search(r'const (\w+)="(\d+)"', src)  # minified: const t="170" ... t as REVISION
    if not (rev and rev.group(2) == "170" and re.search(rf'\b{rev.group(1)} as REVISION\b', src)):
        problems.append("assets/vendor/three/three.module.min.js missing or not r170")
    if not (VENDOR_THREE / "LICENSE").exists():
        problems.append("assets/vendor/three/LICENSE missing")
    html = load_index()
    m = re.search(r'<script type="importmap">(.*?)</script>', html, re.S)
    try:
        import json
        target = json.loads(m.group(1))["imports"]["three"] if m else None
    except (ValueError, KeyError):
        target = None
    if target != "./assets/vendor/three/three.module.min.js":
        problems.append(f"import map maps three to {target!r}")
    elif html.find("<script type=\"importmap\">") > html.find("assets/game/room.js"):
        problems.append("import map must come before room.js")
    check("vendor_three", not problems, "; ".join(problems))


def main():
    for name, fn in list(globals().items()):
        if name.startswith("test_") and callable(fn):
            fn()
    sys.exit(1 if any(not ok for _, ok, _ in RESULTS) else 0)


if __name__ == "__main__":
    main()
