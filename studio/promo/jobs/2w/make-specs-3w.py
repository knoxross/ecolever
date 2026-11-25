#!/usr/bin/env python3
"""3~4주차(지마당 7 · 에코레버 7, track 2w15~2w28) 기획 — RNK 총괄 11/25 요청.
SNS 계정이 열리기 전에 미리 만들어 두는 편이며, 게시는 하지 않는다. 각 편은 9:16·4:5·16:9 와 caption.md 로 만든다.
사실은 지마당 기사 원문(assets/gmadang/2w/*.txt 와 같은 내용)과 brand-facts.md 만 쓴다.
에코레버 편에는 재고 수량과 출고 날짜를 쓰지 않는다.
"""
import json, os

HERE = os.path.dirname(os.path.abspath(__file__))
G = '../../../assets/gmadang/3w/'
E = '../../../assets/ecolever/'
GA = '../../../assets/gmadang/'


def gscene(img, text, sub='', d=3.2, motion='zoomIn', e=1, **kw):
    s = {"text": text, "image": G + img, "fit": "blur", "motion": motion, "font": "serif", "textBg": True,
         "fontSize": 64, "textPos": "bottom", "textAnim": "fade", "duration": d, "transition": "fade", "energy": e}
    # 총괄 11/25: 기사 글자 위 자막이 잘 안 읽힘 → 상자 92% 불투명 + 자막 동안 화면 40% 어둡게
    s["textBox"] = {"opacity": 0.92, "dim": 0.4}
    if sub: s["sub"] = sub
    s.update(kw)
    return s


def gm(n, key, topic, scenes, music, title, tags, source, outro="원문은 지마당에서", outro_sub="gmadang.com"):
    scenes[0]["transition"] = "none"
    return {
        "brand": "gmadang", "track": f"2w{n:02d}", "topic": topic,
        "trend": "저장형 생활 정보 숏폼 · 실제 기사 화면 · 자막만으로 · 잔잔한 음악",
        "source": f"지마당 기사 https://www.gmadang.com/a/{key}.html ({source})",
        "look": "natural", "emoji": False, "scenes": scenes,
        "outro": outro, "outro_sub": outro_sub,
        "card": {"bg": ["#123A24", "#123A24"], "bgStyle": "solid", "color": "#FFFFFF"},
        "logo": {"image": GA + "icon-192.png", "pos": "tr", "size": 0.08},
        "endcard": {"image": GA + "og.png", "size": 0.5},
        "music": {"style": music[0], "meter": "4/4", "bpm": music[1], "seed": 3600 + n},
        "upload": {"title": title, "hashtags": tags + ["지마당", "서울소식"],
                   "link": f"https://www.gmadang.com/a/{key}.html", "source": source + " · 지마당 AI 작성"},
    }


def escene(img, text, sub='', d=3.2, motion='zoomIn', e=1, fit='cover', focus=None, **kw):
    s = {"text": text, "image": E + img, "fit": fit, "motion": motion, "font": "serif", "textBg": True,
         "fontSize": 64, "textPos": "bottom", "textAnim": "fade", "duration": d, "transition": "fade", "energy": e}
    if focus: s["focus"] = focus
    s["textBox"] = {"opacity": 0.92}   # 총괄: 자막 상자 92%
    if sub: s["sub"] = sub
    s.update(kw)
    return s


# 1칼라 사진은 가운데 'ECO' 글자·오른쪽 아래 마크가 잘려 보이지 않게: 손잡이 쪽(위) 또는 전체(blur)만 쓴다
TOP1 = {"s": 2.3, "x": 0.15, "y": 0.95}
TOP1b = {"s": 2.6, "x": 0.55, "y": 0.95}
TEX2 = {"s": 2.3, "x": -0.3, "y": -0.4}
TOP2 = {"s": 2.1, "x": 0.2, "y": 0.9}


def eco(n, topic, scenes, music, title, tags, source, outro="샘플 먼저\n받아 보세요", outro_sub="ecolever.co.kr · 02-6368-9989"):
    scenes[0]["transition"] = "none"
    return {
        "brand": "ecolever", "track": f"2w{n:02d}", "topic": topic,
        "trend": "실물 클로즈업 무드형 숏폼 · 자막만으로 · 어쿠스틱",
        "source": "brand-facts.md · " + source,
        "look": "natural", "emoji": False, "scenes": scenes,
        "outro": outro, "outro_sub": outro_sub,
        "card": {"bg": ["#1F2A21", "#1F2A21"], "bgStyle": "solid", "color": "#EFE9DC"},
        "logo": {"image": E + "symbol-ecolever-light.png", "pos": "tr", "size": 0.08},
        "endcard": {"image": E + "qr-instagram.png", "text": "QR · 인스타그램", "size": 0.2},
        "music": {"style": music[0], "meter": "4/4", "bpm": music[1], "seed": 3700 + n},
        "upload": {"title": title, "hashtags": tags + ["에코레버"], "link": "https://www.ecolever.co.kr/",
                   "source": source + " · 음악: 영상뚝딱 자체 작곡"},
    }



GD = '../../../assets/ecolever/guide3/'
def gshot(img, text, sub='', **kw):   # 에코레버 안내 페이지 화면(글자 많음) — 화면 40% 어둡게
    s = escene('x', text, sub, fit='blur', **kw); s["image"] = GD + img; s["textBox"] = {"opacity": 0.92, "dim": 0.4}; return s

JOBS = {}
# ------------------------------------------------------------------ 지마당 7편 (12월 중순~1월 초에도 유효한 기사)
JOBS['2w-15-gmadang'] = gm(15, 'nn5vk9v', "석촌호수 '더 갤러리 호수' 한국근현대미술거장전 — 거장 32명 작품 44점, 내년 1월 31일까지", [
    gscene('nn5vk9v-0.png', "이중섭·천경자 등\n거장 32명 작품 44점", "석촌호수 '더 갤러리 호수'", e=2),
    gscene('nn5vk9v-1.png', "한국근현대미술거장 특별기획전", "11월 24일 ~ 2027년 1월 31일", motion='zoomOut'),
    gscene('nn5vk9v-1.png', "고희동 · 이중섭 · 천경자 · 방혜자", "송파구 · 고려대학교박물관 공동 기획", e=2),
    gscene('nn5vk9v-2.png', "제1전시장 '거장들을 한자리에'", "제2전시장 '한국 근현대미술 100년의 흐름'", motion='zoomOut', e=2),
    gscene('nn5vk9v-3.png', "연말, 교과서 속 그림을\n직접 보러 가요", "관람 시간은 송파구청에 확인", e=3),
], ('calm', 78), "이중섭·천경자 거장 32명 작품 44점 | 석촌호수 더 갤러리 호수", ["석촌호수", "미술전시", "연말나들이", "이중섭", "송파구"], "송파구 발표(시정일보 보도)")

JOBS['2w-16-gmadang'] = gm(16, 'nn5vkfe', "종로구 한파쉼터 47곳·스마트쉼터 2곳 — 한파특보 땐 구청사 24시간", [
    gscene('nn5vkfe-0.png', "추운 날 몸 녹일 곳,\n종로에 47곳", "구청사·동주민센터·도서관·경로당", e=2),
    gscene('nn5vkfe-1.png', "한파특보 땐 구청사 24시간", "동주민센터는 평일 밤 9시까지", motion='zoomOut'),
    gscene('nn5vkfe-1.png', "정류소 61곳 온열의자", "온기텐트 13곳", e=2),
    gscene('nn5vkfe-2.png', "스마트쉼터 2곳은 늘 열려요", "냉난방기 · 충전기 · 공공와이파이", motion='zoomOut', e=2),
    gscene('nn5vkfe-3.png', "혼자 사는 이웃 어르신이\n걱정되면 동주민센터로", "한파쉼터는 내년 3월 15일까지", e=2),
], ('calm', 74), "종로구 한파쉼터 47곳 · 한파특보 땐 구청사 24시간", ["한파쉼터", "종로구", "겨울나기", "한파"], "종로구 발표(시정일보 보도)")

JOBS['2w-17-gmadang'] = gm(17, 'nn5vl45', "서대문구 올겨울 차도·보도 제설 분리 — 보도 제설 14개 노선 22.4km", [
    gscene('nn5vl45-0.png', "눈 오는 날 보도,\n올겨울엔 따로 치워요", "서대문구 겨울철 제설대책", e=2),
    gscene('nn5vl45-1.png', "보도 제설 14개 노선 · 22.4km", "통학로 · 버스정류장 · 지하철역 주변", motion='zoomOut'),
    gscene('nn5vl45-1.png', "골목엔 소형 장비와\n주민제설반", e=2),
    gscene('nn5vl45-2.png', "내 집·가게 앞 눈은\n먼저 치워 주세요", motion='zoomOut', e=2),
    gscene('nn5vl45-3.png', "얼어붙은 비탈길 신고는\n다산콜센터 120", "제설대책은 2027년 3월 15일까지", e=3),
], ('calm', 76), "올겨울 보도 제설 따로 한다 | 서대문구 14개 노선 22.4km", ["제설", "서대문구", "겨울철대책", "눈오는날"], "서대문구 발표(시정일보 보도)")

JOBS['2w-18-gmadang'] = gm(18, 'nn5vkib', "신촌 '바람산'(창천근린공원) 서울별빛명소 선정 — 지금은 전망 덱에서 야경, 2027년부터 노을정원", [
    gscene('nn5vkib-0.png', "신촌역 걸어서 8분,\n야경 보이는 '바람산'", "창천근린공원", e=1),
    gscene('nn5vkib-1.png', "서울별빛명소 선정", "2026 서울별빛명소 조성사업", motion='zoomOut', e=2),
    gscene('nn5vkib-1.png', "지금도 전망 덱에서\n신촌 야경을 볼 수 있어요", "풍차 조형물 · 엘리베이터", e=2),
    gscene('nn5vkib-2.png', "2027년부터 '노을 전망라운지'로", "연세로와 이어지는 야간 산책길", motion='zoomOut', e=2),
    gscene('nn5vkib-3.png', "연말 저녁 산책,\n바람산 어때요?", e=3),
], ('acoustic', 84), "신촌역 8분, 야경 보이는 바람산 | 서울별빛명소 선정", ["신촌", "야경명소", "서울별빛명소", "연말데이트", "서대문구"], "서대문구 발표(시정일보 보도)")

JOBS['2w-19-gmadang'] = gm(19, 'nn5vl5y', "건대 양꼬치거리 등 골목형상점가 3곳 지정 — 389개 점포 온누리상품권 가맹 가능", [
    gscene('nn5vl5y-0.png', "건대 양꼬치거리에서도\n온누리상품권?", e=2),
    gscene('nn5vl5y-1.png', "골목형상점가 3곳 새로 지정", "광진구 · 11월 19일", motion='zoomOut'),
    gscene('nn5vl5y-1.png', "강변SK뷰 · 건대건국문길 ·\n건대양꼬치거리", "모두 389개 점포", e=2),
    gscene('nn5vl5y-2.png', "온누리상품권 가맹 등록 가능", "가게 입구 가맹점 표시를 확인하세요", motion='zoomOut', e=2),
    gscene('nn5vl5y-3.png', "광진구 골목형상점가 20곳", "전통시장까지 27개 상권", e=3),
], ('acoustic', 92), "건대 양꼬치거리도 온누리상품권 | 골목형상점가 3곳 지정", ["온누리상품권", "건대맛집", "골목형상점가", "광진구"], "광진구 발표(시정일보 보도)")

JOBS['2w-20-gmadang'] = gm(20, 'nn5vkej', "중구 12월부터 '피클볼 원패스' 시범 — 체육관 3곳 한 번 등록으로", [
    gscene('nn5vkej-0.png', "요즘 뜨는 운동, 피클볼", "테니스·배드민턴·탁구의 장점을 합친 운동", e=2),
    gscene('nn5vkej-1.png', "12월부터 '원패스' 시범", "중구시설관리공단", motion='zoomOut'),
    gscene('nn5vkej-1.png', "충무스포츠센터 · 훈련원공원 ·\n무학봉체육관", "한 번 등록으로 세 곳 이용", e=2),
    gscene('nn5vkej-2.png', "코트가 작고 공이 가벼워\n배우기 쉬워요", motion='zoomOut', e=2),
    gscene('nn5vkej-3.png', "이용 방법·시간표는\n중구시설관리공단에", "겨울방학 운동으로", e=3),
], ('lofi', 90), "피클볼 원패스, 체육관 3곳 한 번 등록으로 | 중구 12월부터", ["피클볼", "생활체육", "겨울방학", "중구"], "중구시설관리공단 발표(시정일보 보도)")

JOBS['2w-21-gmadang'] = gm(21, 'nq3yxeq', "서울시 관광특구·전통시장 화장실 개선 — QR로 주변 개방화장실 찾기", [
    gscene('nq3yxeq-0.png', "관광지에서 화장실 급할 때,\nQR을 찍으세요", "서울시 관광특구 화장실 개선", e=2),
    gscene('nq3yxeq-1.png', "명동·남대문 노점에\n'화장실 안내 QR'", "찍으면 주변 개방화장실이 지도에", motion='zoomOut'),
    gscene('nq3yxeq-1.png', "관광특구 8곳으로 넓혀요", "이태원 · 명동 · 종로 · 잠실 · 홍대 등", e=2),
    gscene('nq3yxeq-2.png', "개방화장실 148곳 → 200곳", "2027년까지 · 전통시장 10곳도", motion='zoomOut', e=2),
    gscene('nq3yxeq-3.png', "서울시 '공중화장실 지도'도\n함께 쓰세요", "연말 나들이 전에 저장", e=3),
], ('acoustic', 88), "관광지 화장실, QR 찍으면 지도에 | 서울시 개방화장실 200곳으로", ["서울나들이", "화장실", "생활꿀팁", "서울시"], "서울시 발표(내 손안에 서울)")

# ------------------------------------------------------------------ 에코레버 7편 (안내 페이지 주제, 사실표 범위 · 증명서 보유·날짜 없음)
JOBS['2w-22-ecolever'] = eco(22, "공공기관·지자체 행사용 에코백 — 수량·서류·인쇄 안내", [
    escene('product-1color.jpg', "공공기관 행사 에코백,\n어디서부터 볼까요?", focus=TOP1, e=1),
    gshot('for-public-agency-0b.png', "소규모 행사는\n로고 인쇄 없이 50개부터", "기관 로고 인쇄는 10,000개부터", motion='zoomOut', e=2),
    escene('doc-fiti-test.jpg', "원단 근거는 FITI 시험성적서", "면 85.2% · 황마 10.9% · 레이온 3.9%", fit='blur', e=2),
    escene('product-2color.jpg', "여성기업 제품 구매 목표\n물품·용역 5% 이상", "여성기업지원법 · 적용 기준은 기관 계약 부서에 확인", focus=TEX2, motion='panLeft', e=2),
    escene('product-1color.jpg', "견적서 · 세금계산서 발행", "장당 1칼라 1,000원 · 부가세 별도", focus=TOP1b, motion='panRight', e=3),
], ('corp', 90), "공공기관 행사 에코백 | 50개부터, 견적서·세금계산서", ["공공기관", "지자체행사", "에코백", "단체에코백", "여성기업"], "에코레버 안내 '공공기관·지자체 행사용' · 여성기업 제품 구매 안내")

JOBS['2w-23-ecolever'] = eco(23, "학교·학원 행사용 에코백 — 학급 단위 50개부터, 꾸미기 수업, 행정실 서류", [
    escene('product-1color.jpg', "학급 행사·체험학습 에코백,\n몇 개부터 될까요?", focus=TOP1, e=1),
    gshot('for-school-academy-0.png', "학급·학원 반 단위\n50개부터", "로고 인쇄 없이 · 장당 1칼라 1,000원(부가세 별도)", motion='zoomOut', e=2),
    escene('product-2color.jpg', "꾸미기 수업엔\n인쇄 없는 가방", "학생이 직접 그리거나 스탬프로", fit='blur', e=2),
    escene('product-1color.jpg', "학교 이름 인쇄는\n10,000개부터", "적으면 스티커·스탬프로 표시", fit='blur', motion='zoomOut', e=2),
    escene('product-2color.jpg', "행정실 견적서 · 세금계산서", "법인 사업자 발행", focus=TOP2, e=3),
], ('acoustic', 96), "학교·학원 에코백 | 학급 단위 50개부터", ["학교행사", "학원", "체험학습", "에코백꾸미기", "단체에코백"], "에코레버 안내 '학교·학원 행사용'")

JOBS['2w-24-ecolever'] = eco(24, "기업 판촉·사내 행사용 에코백 — 사내 행사 50개부터, 로고 인쇄 10,000개부터, ESG 근거", [
    escene('product-2color.jpg', "판촉물,\n서랍 말고 가방으로", focus=TEX2, e=1),
    gshot('for-company-promo-0.png', "사내 행사·워크숍은\n인쇄 없이 50개부터", "장당 1칼라 1,000원 · 2칼라 1,200원(부가세 별도)", motion='zoomOut', e=2),
    escene('product-1color.jpg', "회사 로고 인쇄는\n10,000개부터", "시안 확인 뒤 견적서", fit='blur', e=2),
    escene('doc-fiti-test.jpg', "ESG 보고에 붙일 근거", "FITI 혼용률 · 합성섬유 혼용 없음", fit='blur', motion='zoomOut', e=2),
    escene('product-1color.jpg', "처음엔 소량으로 반응 보고,\n다음 행사에서 로고 인쇄로", focus=TOP1b, motion='panRight', e=3),
], ('corp', 94), "기업 판촉·사내 행사 에코백 | 50개부터, 로고 인쇄 10,000개부터", ["기업판촉물", "사내행사", "ESG", "에코백", "판촉물"], "에코레버 안내 '기업 판촉·사내 행사용'")

JOBS['2w-25-ecolever'] = eco(25, "FAQ① 단체 에코백은 몇 개부터? — 로고 인쇄 없이 50개, 로고 인쇄 10,000개", [
    escene('product-1color.jpg', "Q. 단체 에코백,\n몇 개부터 주문돼요?", focus=TOP1, e=1),
    gshot('faq-0.png', "A. 로고 인쇄 없이 50개부터", "에코레버 자주 묻는 질문", motion='zoomOut', e=2),
    escene('product-2color.jpg', "기관·기업 로고 인쇄는\n10,000개부터", focus=TEX2, motion='panLeft', e=2),
    escene('product-1color.jpg', "수량과 관계없이 같은 장당 가격", "1칼라 1,000원 · 2칼라 1,200원(부가세 별도)", fit='blur', e=2),
    escene('product-2color.jpg', "다른 질문은\n누리집 FAQ에서", "ecolever.co.kr/guide/faq.html", focus=TOP2, e=3),
], ('calm', 82), "Q. 단체 에코백 몇 개부터? A. 50개부터", ["에코백", "단체에코백", "자주묻는질문", "행사굿즈"], "에코레버 자주 묻는 질문")

JOBS['2w-26-ecolever'] = eco(26, "FAQ② 가격은? — 장당 1칼라 1,000원·2칼라 1,200원(부가세 별도, 포함 1,100원·1,320원)", [
    escene('product-2color.jpg', "Q. 에코백 가격은\n얼마예요?", focus=TEX2, e=1),
    gshot('faq-0.png', "1칼라 장당 1,000원", "부가세 포함 1,100원", motion='zoomOut', e=2),
    escene('product-2color.jpg', "2칼라 장당 1,200원", "부가세 포함 1,320원", fit='blur', e=2),
    escene('product-1color.jpg', "로고 인쇄 주문은\n시안 확인 뒤 견적", fit='blur', motion='zoomOut', e=2),
    escene('product-1color.jpg', "견적서 · 세금계산서 발행", "수량과 관계없이 같은 장당 가격", focus=TOP1b, motion='panRight', e=3),
], ('acoustic', 88), "Q. 에코백 가격은? A. 장당 1,000원부터(부가세 별도)", ["에코백가격", "단체에코백", "자주묻는질문", "행사굿즈"], "에코레버 자주 묻는 질문")

JOBS['2w-27-ecolever'] = eco(27, "FAQ③ 크기와 원단은? — 40×37cm·약 70g, 면 85.2%·황마 10.9%·레이온 3.9%", [
    escene('product-1color.jpg', "Q. 크기와 원단은\n어떻게 되나요?", focus=TOP1, e=1),
    escene('product-1color.jpg', "40×37cm · 손잡이 40cm", "장당 약 70g", fit='blur', motion='zoomOut', e=2),
    escene('product-2color.jpg', "1칼라 크림톤 단색 ·\n2칼라 그레이·크림 투톤", fit='blur', e=2),
    escene('doc-fiti-test.jpg', "면 85.2% · 황마 10.9% · 레이온 3.9%", "FITI 시험성적서 기준", fit='blur', motion='zoomOut', e=2),
    escene('product-2color.jpg', "폴리에스터 같은\n합성섬유는 없어요", "성적서 혼용률 기준", focus=TEX2, motion='panLeft', e=3),
], ('luxury', 78), "Q. 크기와 원단은? A. 40×37cm, 면·황마 혼방", ["에코백", "면황마", "시험성적서", "자주묻는질문"], "에코레버 자주 묻는 질문 · FITI 시험성적서")

JOBS['2w-28-ecolever'] = eco(28, "샘플 신청 — 대량 주문 전에 1칼라 실물로 원단·색감·크기 확인", [
    escene('product-1color.jpg', "대량 주문 전에\n실물부터 보세요", focus=TOP1, e=1),
    escene('product-1color.jpg', "1칼라는 실물 샘플로\n원단·색감·크기 확인", fit='blur', motion='zoomOut', e=2),
    gshot('faq-1b.png', "문의서에서 '샘플 먼저\n받아보고 싶어요' 체크", "에코레버 자주 묻는 질문", e=2),
    escene('product-2color.jpg', "2칼라는 주문을 받은 뒤 생산", focus=TEX2, motion='panLeft', e=2),
    escene('product-1color.jpg', "전화 02-6368-9989", "누리집 문의서 · 메일 모두 가능", focus=TOP1b, motion='panRight', e=3),
], ('acoustic', 86), "대량 주문 전에 샘플 먼저 | 에코레버 1칼라 실물 확인", ["에코백샘플", "단체에코백", "행사굿즈", "에코백"], "에코레버 자주 묻는 질문")

for name, spec in JOBS.items():
    d = os.path.join(HERE, name)
    os.makedirs(d, exist_ok=True)
    with open(os.path.join(d, 'spec.json'), 'w', encoding='utf-8') as f:
        json.dump(spec, f, ensure_ascii=False, indent=2)
print(len(JOBS), 'specs')
