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
<link rel="icon" type="image/svg+xml" href="/imgs/ecolever-symbol.svg">
<link rel="icon" type="image/png" sizes="64x64" href="/imgs/favicon.png">
<link rel="apple-touch-icon" href="/imgs/apple-touch-icon.png">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Gowun+Batang:wght@400;700&display=swap">
<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.css">
<link rel="stylesheet" href="/css/style.css">
<link rel="stylesheet" href="/css/guide.css">
{ld}
</head>
<body>
<!-- 본 사이트(index.html)와 같은 머리: 어느 화면에서든 에코레버 로고·메뉴·전화·주문 문의가 보이게 -->
<header class="masthead">
  <div class="wrap">
    <a class="brand-id" href="/" aria-label="ECOLEVER 에코레버 첫 화면">
      <img class="eco-logo" src="/imgs/ecolever-logo.svg" width="164" height="44" alt="ECOLEVER 에코레버">
    </a>
    <div class="masthead-right">
      <nav class="nav-jump" aria-label="페이지 메뉴">
        <a href="/#eco">제품</a>
        <a href="/#why">왜 에코레버</a>
        <a href="/#lineup">사양·주문방식</a>
        <a href="/#trust">인증서류</a>
        <a href="/#process">주문절차</a>
        <a href="/#videos">영상</a>
        <a href="/#faq">FAQ</a>
        <a href="/guide/" class="active" aria-current="page">구매 가이드</a>
      </nav>
      <div class="header-cta">
        <a href="tel:02-6368-9989" class="header-tel">☎ 02-6368-9989</a>
        <a href="/#inquiry" class="btn btn-moss header-btn">주문 문의</a>
      </div>
    </div>
  </div>
</header>
<main class="wrap g-main">
"""
FOOT = """
<aside class="g-box">
  <b>에코레버 — 친환경 에코백 대량 맞춤제작</b>
  <p>면·황마 혼방 원단(FITI 시험성적서) · 최소주문 50개 (로고 인쇄 10,000개부터) · 1칼라 실물 재고 보유 · 여성기업 확인서 · 견적서·세금계산서 발행</p>
  <a href="/#inquiry" class="btn btn-moss">무료 견적 받기</a> <a href="tel:02-6368-9989" class="btn btn-outline">☎ 02-6368-9989</a>
</aside>
</main>
<!-- 본 사이트와 같은 바닥글 -->
<footer class="site-footer">
  <div class="wrap">
    <div class="footer-grid">
      <div class="footer-brand">
        <p class="footer-tagline"><b>ECOLEVER 에코레버</b><br>행사에서 나눠주고, 일상에서 다시 들게 되는 친환경 에코백</p>
        <a href="/#inquiry" class="btn btn-moss">무료 견적 받기</a>
      </div>
      <nav class="footer-col" aria-label="바닥글 메뉴">
        <h5>바로가기</h5>
        <a href="/#eco">제품</a>
        <a href="/#lineup">라인업 · 사양</a>
        <a href="/#order-guide">주문 방식</a>
        <a href="/#trust">인증서류</a>
        <a href="/#process">주문절차</a>
        <a href="/#faq">자주 묻는 질문</a>
        <a href="/guide/">에코백 대량 구매 가이드</a>
        <a href="https://www.gmadang.com/" rel="noopener">계열 서비스 · 지마당(서울 동네 신문)</a>
      </nav>
      <div class="footer-col">
        <h5>고객센터</h5>
        <a class="footer-tel" href="tel:02-6368-9989">02-6368-9989</a>
        <a href="mailto:knox@ecolever.co.kr">knox@ecolever.co.kr</a>
        <span class="footer-small">최소주문 50개 · 로고 인쇄 10,000개부터</span>
      </div>
      <div class="footer-col footer-biz">
        <h5>사업자 정보</h5>
        <span><a href="https://www.gmadang.com/rnk/?utm_source=ecolever&amp;utm_medium=footer" style="color:inherit">(주)알앤케이그린월드</a> · 대표 김국화</span>
        <span>사업자등록번호 522-87-02135</span>
        <span>통신판매업신고 제2026-서울동작-1021호</span>
        <span>서울특별시 동작구 성대로25길 11<br>(상도동 198-47 루나포레)</span>
      </div>
    </div>
    <div class="footer-bottom">
      <span>© 2026 (주)알앤케이그린월드. All rights reserved.</span>
      <span>여성기업 확인서 · FITI 시험성적서 · 통신판매업 신고 완료</span>
    </div>
  </div>
</footer>
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
    urls = [(f"{SITE}/", latest, "1.0"), (f"{SITE}/guide/", latest, "0.8"), (f"{SITE}/guide/faq.html", "2026-11-25", "0.8")] + [(f"{SITE}/guide/{m['slug']}.html", m["date"], "0.7") for m in posts]
    (ROOT / "sitemap.xml").write_text('<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
        "".join(f"  <url><loc>{u}</loc><lastmod>{d}</lastmod><priority>{p}</priority></url>\n" for u, d, p in urls) + "</urlset>\n", encoding="utf-8")

    llms = ["# ECOLEVER 에코레버 ((주)알앤케이그린월드)",
            "",
            "> 단체·행사·판촉용 면·황마 혼방 에코백. 로고 인쇄 없는 주문은 50개부터 장당 1칼라 1,000원·2칼라 1,200원(부가세 별도, 수량과 관계없이 같은 가격), 로고 인쇄 주문은 10,000개부터 별도 견적. 여성기업 (주)알앤케이그린월드가 운영합니다. 문의 02-6368-9989, knox@ecolever.co.kr",
            "",
            "## 제품 사실 (2026-11-25 기준, 회사 사실표와 같음)",
            "- 소재: FITI 시험성적서 기준 면 85.2% · 황마 10.9% · 레이온 3.9% (혼용률에 폴리에스터 등 합성섬유 없음)",
            "- 사이즈: 40×37cm(가로×세로), 손잡이 40cm, 장당 약 70g. 1칼라(크림톤 단색)·2칼라(그레이·크림 투톤)",
            "- 최소 수량: 로고 인쇄 없이 50개부터. 로고 인쇄는 10,000개부터",
            "- 가격(로고 인쇄 없음): 장당 1칼라 1,000원 · 2칼라 1,200원, 부가세 별도(부가세 포함 1,100원·1,320원). 로고 인쇄는 시안 확인 뒤 견적",
            "- 재고·납기: 1칼라 실물 재고가 있어 샘플로 먼저 확인할 수 있습니다. 2칼라는 주문 뒤 생산합니다. 사이즈별 대량 물량은 2027년 1월 입고 예정입니다(날짜 확정 전). 출고일은 수량과 행사 날짜를 받은 뒤 안내합니다",
            "- 서류: 견적서·세금계산서 발행, 여성기업 확인서, FITI 시험성적서, 통신판매업 신고증 사본 제공",
            "- 문의 방법: 누리집 문의서(https://www.ecolever.co.kr/#inquiry), 전화 02-6368-9989, 메일 knox@ecolever.co.kr. 수량·칼라·인쇄 여부·행사 날짜를 알려 주시면 견적서를 보내 드립니다",
            "- 쓰지 않는 표현: 생분해·자연분해·식물성 섬유 100%(시험 근거 없음), 조달 등록(아직 없음)",
            "",
            "## 핵심 페이지",
            f"- [제품·사양·인증서류·견적 문의]({SITE}/): 40×37cm, 손잡이 40cm, 1칼라·2칼라",
            f"- [자주 묻는 질문]({SITE}/guide/faq.html): 단체 주문, 가격, 인쇄, 납기, 소재, 서류, 견적 방법",
            "",
            "## 운영사·계열 서비스",
            "- 운영사: (주)알앤케이그린월드 (여성기업, 서울특별시 동작구 성대로25길 11, 대표이사 김국화, 사업자등록번호 522-87-02135) — [회사 소개](https://www.gmadang.com/rnk/)",
            "- [지마당](https://www.gmadang.com/): 서울 25개 구 구정소식 동네 신문 (같은 운영사)",
            "- [더블유 STUDY & SEMINAR SPACE](https://www.gmadang.com/w/): 서울 동작구 상도동 공간대여 (같은 운영사)",
            "",
            "## 구매 가이드"] + [f"- [{m['title']}]({SITE}/guide/{m['slug']}.html): {m['description']}" for m in posts]
    (ROOT / "llms.txt").write_text("\n".join(llms) + "\n", encoding="utf-8")
    print(f"built {len(posts)} guides")

if __name__ == "__main__":
    main()
