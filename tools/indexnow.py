#!/usr/bin/env python3
"""IndexNow 알림 — 이번 배포에서 새로 생기거나 바뀐 페이지 주소만 검색엔진에 알립니다.

  python3 tools/indexnow.py HOST KEY [PREFIX]
    HOST   예: www.gmadang.com
    KEY    사이트 뿌리의 KEY.txt 와 같은 값
    PREFIX 저장소 안에서 사이트 뿌리 폴더(지마당 'release/', 에코레버 '')

GitHub Actions 안에서 돌면 GITHUB_REPOSITORY·GITHUB_TOKEN·BEFORE·AFTER(푸시 전후 커밋)로
GitHub compare API 에서 바뀐 파일을 받아 주소로 바꿉니다. 바뀐 파일을 못 받으면(수동 실행 등)
사이트맵 앞쪽 30개를 보냅니다. 받는 곳: api.indexnow.org(빙·얀덱스 등 공유), searchadvisor.naver.com.
어떤 경우에도 0으로 끝납니다(배포를 멈추지 않음). 표준 라이브러리만 씁니다.
"""
import json, os, re, sys, urllib.request

ENDPOINTS = ["https://api.indexnow.org/indexnow", "https://searchadvisor.naver.com/indexnow"]
SKIP = re.compile(r"(^|/)(data|api|docs|tools|guides-src|\.github)/|(^|/)404\.html$")


def get(url, token=None, timeout=30):
    req = urllib.request.Request(url, headers={"User-Agent": "rnk-indexnow/1.0", "Accept": "application/vnd.github+json"})
    if token: req.add_header("Authorization", "Bearer " + token)
    with urllib.request.urlopen(req, timeout=timeout) as r: return r.read().decode("utf-8", "replace")


def to_url(host, prefix, path):
    if prefix:
        if not path.startswith(prefix): return None
        path = path[len(prefix):]
    m = re.match(r"guides-src/(.+)\.md$", path)          # 에코레버: 원고가 바뀌면 만들어지는 가이드 페이지
    if m: path = "guide/" + m.group(1) + ".html"
    if SKIP.search(path): return None
    if not path.endswith(".html"): return None
    if path == "index.html": return f"https://{host}/"
    if path.endswith("/index.html"): return f"https://{host}/{path[:-10]}"
    return f"https://{host}/{path}"


def changed_urls(host, prefix):
    repo, tok = os.environ.get("GITHUB_REPOSITORY"), os.environ.get("GITHUB_TOKEN")
    a, b = os.environ.get("BEFORE", ""), os.environ.get("AFTER", "")
    if not (repo and a and b) or set(a) == {"0"}: return None
    try:
        d = json.loads(get(f"https://api.github.com/repos/{repo}/compare/{a}...{b}", tok))
    except Exception as e:
        print("compare 실패:", e); return None
    out = []
    for f in d.get("files", []):
        if f.get("status") == "removed": continue
        u = to_url(host, prefix, f.get("filename", ""))
        if u and u not in out: out.append(u)
    return out


def sitemap_urls(host, n=30):
    try: return re.findall(r"<loc>([^<]+)</loc>", get(f"https://{host}/sitemap.xml"))[:n]
    except Exception as e: print("사이트맵 실패:", e); return []


def main():
    if len(sys.argv) < 3: print(__doc__); return
    host, key = sys.argv[1], sys.argv[2]; prefix = sys.argv[3] if len(sys.argv) > 3 else ""
    urls = changed_urls(host, prefix)
    if urls is None: urls = sitemap_urls(host); print("바뀐 파일을 몰라 사이트맵 앞쪽", len(urls), "개를 보냅니다")
    if not urls: print("알릴 주소 없음"); return
    if f"https://{host}/sitemap.xml" not in urls: urls.append(f"https://{host}/sitemap.xml")
    urls = urls[:10000]
    body = json.dumps({"host": host, "key": key, "keyLocation": f"https://{host}/{key}.txt", "urlList": urls}).encode()
    print(len(urls), "개 주소:", *urls[:20], "…" if len(urls) > 20 else "", sep="\n  ")
    for ep in ENDPOINTS:
        try:
            req = urllib.request.Request(ep, data=body, method="POST", headers={"Content-Type": "application/json; charset=utf-8", "User-Agent": "rnk-indexnow/1.0"})
            with urllib.request.urlopen(req, timeout=30) as r: print(ep, "->", r.status)
        except urllib.error.HTTPError as e: print(ep, "->", e.code, e.read()[:200].decode("utf-8", "replace"))
        except Exception as e: print(ep, "-> 실패", e)


if __name__ == "__main__":
    try: main()
    except Exception as e: print("IndexNow 알림 실패(배포는 계속):", e)
    sys.exit(0)
