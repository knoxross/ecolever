#!/usr/bin/env python3
"""guides-src/*.md -> guide/<slug>.html, guide/index.html, sitemap.xml, llms.txt

소스 형식 (맨 위 메타 + 간단한 마크다운):
    title: 글 제목
    description: 검색 결과에 보일 한두 문장
    date: 2026-11-01
    ---
    ## 소제목
    문단...
    - 목록
표준 라이브러리만 씁니다. 실행: python3 tools/build_guides.py
"""
import html, json, pathlib, re

ROOT = pathlib.Path(__file__).resolve().parent.parent
SITE = "https://www.ecolever.co.kr"
SRC, OUT = ROOT / "guides-src", ROOT / "guide"

def inline(t):
    t = html.escape(t)
    t = re.sub(r"\*\*(.+?)\*\*", r"<b>\1</b>", t)
    return re.sub(r"\[(.+?)\]\((https?://[^)\s]+|/[^)\s]*|#[^)\s]*)\)", r'<a href="\2">\1</a>', t)

def md(body):
    out, para, lst = [], [], []
    def flush():
        if para: out.append("<p>" + inline(" ".join(para)) + "</p>"); para.clear()
        if lst: out.append("<ul>" + "".join("<li>" + inline(x) + "</li>" for x in lst) + "</ul>"); lst.clear()
    for line in body.splitlines():
        s = line.strip()
        if not s: flush()
        elif s.startswith("### "): flush(); out.append("<h3>" + inline(s[4:]) + "</h3>")
        elif s.startswith("## "): flush(); out.append("<h2>" + inline(s[3:]) + "</h2>")
        elif s.startswith("- "):
            if para: flush()
            lst.append(s[2:])
        else:
            if lst: flush()
            para.append(s)
    flush()
    return "\n".join(out)

def parse(p):
    head, _, body = p.read_text(encoding="utf-8").partition("\n---\n")
    meta = dict(l.split(":", 1) for l in head.splitlines() if ":" in l)
    meta = {k.strip(): v.strip() for k, v in meta.items()}
    meta["slug"], meta["body"] = p.stem, body
    return meta

HEAD = """<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<script async src="https://www.googletagmanager.com/gtag/js?id=G-85K19J7B8D"></script>
<script>window.dataLayer=window.dataLayer||[];function gtag(){{dataLayer.push(arguments);}}gtag('js',new Date());gtag('config','G-85K19J7B8D');</script>
<title>{title} | ECOLEVER 에코레버</title>
<meta name="description" content="{desc}">
<link rel="canonical" href="{url}">
<meta property="og:type" content="{ogtype}">
<meta property="og:site_name" content="ECOLEVER 에코레버">
<meta property="og:title" content="{title}">
<meta property="og:description" content="{desc}">
<meta property="og:url" content="{url}">
<meta property="og:image" content="{site}/imgs/product-1color.jpg">
<link rel="icon" type="image/png" href="/imgs/favicon.png">
<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.css">
<link rel="stylesheet" href="/css/style.css">
<link rel="stylesheet" href="/css/guide.css">
{ld}
</head>
<body>
<header class="g-head"><div class="wrap"><a href="/" class="g-brand">ECOLEVER <span>에코레버</span></a><a href="/guide/" class="g-nav">구매 가이드</a><a href="/#inquiry" class="btn btn-moss g-cta">견적 문의</a></div></header>
<main class="wrap g-main">
"""
FOOT = """
<aside class="g-box">
  <b>에코레버 — 친환경 에코백 대량 맞춤제작</b>
  <p>면·황마 혼방 원단(FITI 시험성적서) · 최소주문 100개 (로고 인쇄 10,000개부터) · 1칼라 실물 재고 보유 · 여성기업 확인서 · 견적서·세금계산서 발행</p>
  <a href="/#inquiry" class="btn btn-moss">무료 견적 받기</a> <a href="tel:02-6368-9989" class="btn btn-outline">☎ 02-6368-9989</a>
</aside>
</main>
<footer><div class="wrap">(주)알앤케이그린월드 · 대표 김국화 · 사업자등록번호 522-87-02135 · 통신판매업신고 제2026-서울동작-1021호<br>서울특별시 동작구 성대로25길 11 · <a href="tel:02-6368-9989">02-6368-9989</a> · <a href="mailto:knox@ecolever.co.kr">knox@ecolever.co.kr</a></div></footer>
</body>
</html>
"""

def ldjson(o):
    return '<script type="application/ld+json">' + json.dumps(o, ensure_ascii=False) + "</script>"

def main():
    OUT.mkdir(exist_ok=True)
    posts = sorted((parse(p) for p in SRC.glob("*.md")), key=lambda m: m.get("date", ""), reverse=True)
    for m in posts:
        url = f"{SITE}/guide/{m['slug']}.html"
        ld = ldjson({"@context": "https://schema.org", "@type": "Article", "headline": m["title"],
                     "description": m["description"], "datePublished": m["date"], "dateModified": m["date"],
                     "inLanguage": "ko", "mainEntityOfPage": url, "image": f"{SITE}/imgs/product-1color.jpg",
                     "author": {"@type": "Organization", "name": "(주)알앤케이그린월드"},
                     "publisher": {"@type": "Organization", "name": "(주)알앤케이그린월드", "logo": {"@type": "ImageObject", "url": f"{SITE}/imgs/logo.png"}}})
        page = HEAD.format(title=html.escape(m["title"]), desc=html.escape(m["description"]), url=url,
                           ogtype="article", site=SITE, ld=ld)
        page += f'<p class="g-crumb"><a href="/guide/">구매 가이드</a> · {m["date"]}</p>\n<article class="g-art">\n<h1>{html.escape(m["title"])}</h1>\n<p class="g-lead">{html.escape(m["description"])}</p>\n{md(m["body"])}\n</article>' + FOOT
        (OUT / f"{m['slug']}.html").write_text(page, encoding="utf-8")
    items = "\n".join(f'<li><a href="/guide/{m["slug"]}.html"><b>{html.escape(m["title"])}</b><span>{html.escape(m["description"])}</span></a></li>' for m in posts)
    idx = HEAD.format(title="에코백 대량 구매 가이드", desc="행사·판촉용 친환경 에코백을 대량 구매할 때 알아야 할 서류, 납기, 사양, 공공구매 정보를 정리했습니다.",
                      url=f"{SITE}/guide/", ogtype="website", site=SITE, ld="")
    idx += f'<h1>에코백 대량 구매 가이드</h1>\n<p class="g-lead">발주 담당자가 실제로 묻는 질문에 답합니다.</p>\n<ul class="g-list">\n{items}\n</ul>' + FOOT
    (OUT / "index.html").write_text(idx, encoding="utf-8")

    latest = posts[0]["date"] if posts else "2026-11-01"
    urls = [(f"{SITE}/", latest, "1.0"), (f"{SITE}/guide/", latest, "0.8")] + [(f"{SITE}/guide/{m['slug']}.html", m["date"], "0.7") for m in posts]
    (ROOT / "sitemap.xml").write_text('<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
        "".join(f"  <url><loc>{u}</loc><lastmod>{d}</lastmod><priority>{p}</priority></url>\n" for u, d, p in urls) + "</urlset>\n", encoding="utf-8")

    llms = ["# ECOLEVER 에코레버 ((주)알앤케이그린월드)", "",
            "> 서점·전시회·기업 행사·공공기관을 위한 면·황마 혼방 친환경 에코백 대량 맞춤제작(로고 인쇄). 여성기업 확인서 보유, FITI 시험성적서(면 85.2%·황마 10.9%), 1칼라 실물 재고 보유, 견적서·세금계산서 발행. 최소주문 100개(로고 인쇄 없는 주문), 로고 인쇄는 10,000개부터. 문의 02-6368-9989, knox@ecolever.co.kr", "",
            "## 핵심 페이지", f"- [제품·사양·인증서류·견적 문의]({SITE}/): 사이즈 40×37cm, 손잡이 40cm, 1칼라·2칼라", "",
            "## 구매 가이드"] + [f"- [{m['title']}]({SITE}/guide/{m['slug']}.html): {m['description']}" for m in posts]
    (ROOT / "llms.txt").write_text("\n".join(llms) + "\n", encoding="utf-8")
    print(f"built {len(posts)} guides")

if __name__ == "__main__":
    main()
