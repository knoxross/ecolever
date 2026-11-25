#!/usr/bin/env python3
"""2주 분량(지마당 7 · 에코레버 7) 기획 만들기 — RNK 총괄 11/25 요청.
SNS 계정이 열리기 전에 미리 만들어 두는 편이며, 게시는 하지 않는다. 각 편은 9:16·4:5·16:9 와 caption.md 로 만든다.
사실은 지마당 기사 원문(assets/gmadang/2w/*.txt 와 같은 내용)과 brand-facts.md 만 쓴다.
에코레버 편에는 재고 수량과 출고 날짜를 쓰지 않는다.
"""
import json, os

HERE = os.path.dirname(os.path.abspath(__file__))
G = '../../../assets/gmadang/2w/'
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
        "music": {"style": music[0], "meter": "4/4", "bpm": music[1], "seed": 2600 + n},
        "upload": {"title": title, "hashtags": tags + ["지마당", "서울소식"],
                   "link": f"https://www.gmadang.com/a/{key}.html", "source": source + " · 지마당 AI 작성"},
    }


def escene(img, text, sub='', d=3.2, motion='zoomIn', e=1, fit='cover', focus=None, **kw):
    s = {"text": text, "image": E + img, "fit": fit, "motion": motion, "font": "serif", "textBg": True,
         "fontSize": 64, "textPos": "bottom", "textAnim": "fade", "duration": d, "transition": "fade", "energy": e}
    if focus: s["focus"] = focus
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
        "music": {"style": music[0], "meter": "4/4", "bpm": music[1], "seed": 2700 + n},
        "upload": {"title": title, "hashtags": tags + ["에코레버"], "link": "https://www.ecolever.co.kr/",
                   "source": source + " · 음악: 영상뚝딱 자체 작곡"},
    }


JOBS = {}
# ------------------------------------------------------------------ 지마당 7편 (실제 기사)
JOBS['2w-01-gmadang'] = gm(1, 'nq3yxer', "한성백제박물관 특별전 '삼국사기·삼국유사, 백제를 기록하다' — 국보 삼국사기 전권, 무료", [
    gscene('nq3yxer-0.png', "국보 『삼국사기』 전권을\n무료로 볼 수 있어요", e=2),
    gscene('nq3yxer-1.png', "한성백제박물관 특별전", "2026년 11월 27일 ~ 2027년 2월 21일", motion='zoomOut'),
    gscene('nq3yxer-1.png', "기획전시실 1·2 · 관람료 무료", "매주 월요일과 1월 1일은 휴관", e=2),
    gscene('nq3yxer-2.png', "옥산서원 소장 1573년 무렵 인쇄본", "『삼국사기』 9책 50권 전권", motion='zoomOut', e=2),
    gscene('nq3yxer-3.png', "겨울방학, 아이와\n역사 나들이 어때요?", "관람 시간·교통편은 박물관 누리집에서", e=3),
], ('calm', 80), "국보 삼국사기 전권 무료 공개 | 한성백제박물관 특별전", ["한성백제박물관", "삼국사기", "겨울방학", "무료전시", "송파구"], "서울시 발표(내 손안에 서울)")

JOBS['2w-02-gmadang'] = gm(2, 'nq3yxc3', "서울백제어린이박물관 아기 매머드 '디마' 특별전 — 내년 3월 7일까지 무료", [
    gscene('nq3yxc3-0.png', "4만 4,500년 전\n아기 매머드 '디마'", e=2),
    gscene('nq3yxc3-1.png', "서울백제어린이박물관 특별전", "11월 17일 ~ 2027년 3월 7일 · 관람료 무료", motion='zoomOut'),
    gscene('nq3yxc3-1.png', "매머드 뼈 연주하기 ·\n나만의 디마 엽서 꾸미기", "연계 체험", e=2),
    gscene('nq3yxc3-2.png', "화~금 오전 9시~오후 6시", "주말·공휴일 9시 30분~5시 30분 · 월요일 휴관", motion='zoomOut', e=2),
    gscene('nq3yxc3-3.png', "상설전시는\n누리집에서 미리 예약", "겨울방학 아이와 가 볼 곳", e=3),
], ('acoustic', 96), "아기 매머드 '디마' 특별전, 내년 3월까지 무료 | 서울백제어린이박물관", ["어린이박물관", "매머드", "겨울방학", "아이와갈만한곳", "무료전시"], "서울시 발표(내 손안에 서울)")

JOBS['2w-03-gmadang'] = gm(3, 'nzag38v', "서울시 겨울철 종합대책 — 한파쉼터 1,461곳·이동식 쉼터 '온기소'·에너지바우처", [
    gscene('nzag38v-0.png', "추운 날 들어갈 곳,\n서울에 1,461곳", "서울시 한파쉼터", e=2),
    gscene('nzag38v-1.png', "기후동행쉼터 409곳도", "민관이 함께 운영 · 내년 3월 15일까지", motion='zoomOut'),
    gscene('nzag38v-1.png', "12~2월 이동식 쉼터 '온기소'", "광화문광장 등 사람이 많은 곳", e=2),
    gscene('nzag38v-2.png', "12~3월 평일 오전 6시~오후 9시", "배출가스 5등급 차량 운행 제한", motion='zoomOut', e=2),
    gscene('nzag38v-2.png', "에너지바우처는\n12월 31일까지 신청", "동주민센터", e=3),
], ('calm', 78), "한파쉼터 1,461곳·이동식 쉼터 '온기소' | 서울시 겨울철 종합대책", ["한파쉼터", "겨울철대책", "에너지바우처", "서울시"], "서울시 발표(이투데이 보도)")

JOBS['2w-04-gmadang'] = gm(4, 'nq4783h', "[모아 보기] 빈 페트병·장바구니·텀블러로 포인트·현금 받는 곳 6가지(11월 24일 기준)", [
    gscene('nq4783h-0.png', "빈 페트병 1개에 10포인트", "동대문구 무인회수기 · 11월 24일 기준", e=2),
    gscene('nq4783h-1.png', "2,000포인트(200개)부터\n현금으로", "'수퍼빈' 앱 · 동대문구청 광장 등 4곳", motion='zoomOut'),
    gscene('nq4783h-1.png', "장바구니 쓰면 회당 50원", "탄소중립포인트 참여 매장 · 1인 연 최대 7만 원", e=2),
    gscene('nq4783h-2.png', "텀블러 할인 · 컵 회수기 ·\n자원순환 견학까지", "성동구 · 서초구 · 은평구", motion='zoomOut', e=2),
    gscene('nq4783h-3.png', "라벨 떼고 모아 두세요", "탄소중립포인트 가입 cpoint.or.kr", e=3),
], ('acoustic', 92), "빈 페트병·장바구니·텀블러로 포인트 받는 곳 6가지", ["탄소중립포인트", "페트병", "텀블러", "분리배출", "생활꿀팁"], "지마당 정리(동대문구·용산구·성동구·서초구·은평구·한국환경산업기술원 발표)")

JOBS['2w-05-gmadang'] = gm(5, 'nq3yxc6', "서울시 명소 13곳 '3D 디지털 배경' 무료 배포 — 웹툰·애니 상업용도 가능", [
    gscene('nq3yxc6-0.png', "웹툰 배경, 서울 명소를\n무료로 쓰세요", "서울 명소 3D 디지털 애셋 13종", e=2),
    gscene('nq3yxc6-1.png', "DDP · 청계천 · 여의도 한강공원 ·\n반포대교와 세빛섬", "외부 5곳 · 실내 8곳", motion='zoomOut'),
    gscene('nq3yxc6-1.png', "창작 플랫폼 '에이콘(ACON)'", "회원 가입 후 무료 · 스케치업 형식", e=2),
    gscene('nq3yxc6-2.png', "상업용 웹툰·영상도 가능", "작품에 서울시·서울경제진흥원 애셋 활용 표기", motion='zoomOut', e=2),
    gscene('nq3yxc6-3.png', "되팔기·유료 재배포는 안 돼요", "문의 다산콜센터 02-120", e=3),
], ('lofi', 82), "서울 명소 3D 배경 무료 — 웹툰·애니 상업용도 가능", ["웹툰", "애니메이션", "무료소스", "3D배경", "서울시"], "서울시 발표(내 손안에 서울)")

JOBS['2w-06-gmadang'] = gm(6, 'nn5uyfd', "성동구 12월부터 '이동식 반려동물 장례' — 구민 60% 할인, 75세 이상 홀몸 어르신 무료", [
    gscene('nn5uyfd-0.png', "반려동물과의 마지막 인사,\n집 앞으로 찾아와요", "성동구 이동식 반려동물 장례 · 12월부터", e=1),
    gscene('nn5uyfd-1.png', "장례 차량이 원하는 곳으로", "추모 예식 · 차량 안에서 화장 · 유골함 전달", motion='zoomOut', e=1),
    gscene('nn5uyfd-1.png', "성동구민 60% 할인", "취약계층 80% · 만 75세 이상 홀몸 어르신 무료", e=2),
    gscene('nn5uyfd-2.png', "동물등록을 마친\n반려가구가 대상", "등록 안 했다면 미리 해 두세요", motion='zoomOut', e=2),
    gscene('nn5uyfd-3.png', "신청 방법은 12월\n성동구청 누리집에서", e=2),
], ('calm', 72), "이동식 반려동물 장례, 구민 60% 할인 | 성동구 12월부터", ["반려동물", "반려동물장례", "성동구", "펫로스"], "성동구 발표(시정일보 보도)", outro="원문은 지마당에서")

JOBS['2w-07-gmadang'] = gm(7, 'nx14ow', "서대문구 백련산 숲속치유센터 겨울 프로그램 11/29~12/27 — 회당 10명 이내", [
    gscene('nx14ow-0.png', "추운 날에도 숲에서\n쉬어 가세요", "서대문구 백련산 숲속치유센터", e=1),
    gscene('nx14ow-1.png', "12월 6일(일) 수능 마친\n학생·학부모 초대", "호흡명상 · 꽃차 · 꽃말 나누기", motion='zoomOut', e=2),
    gscene('nx14ow-1.png', "12월 13일 임신부·예비 부모", "12월 20일 취업준비생·대학생", e=2),
    gscene('nx14ow-2.png', "12월 27일 일반 성인 '숲, 숨, 쉼'", "회당 10명 이내 소규모", motion='zoomOut', e=2),
    gscene('nx14ow-3.png', "공공서비스예약에서\n'백련산 치유' 검색", "일찍 신청하세요", e=3),
], ('acoustic', 84), "백련산 숲속치유센터 겨울 프로그램 | 수험생·예비 부모·청년", ["숲치유", "서대문구", "수능끝", "주말나들이", "힐링"], "서대문구 발표(구청 보도자료)")

# ------------------------------------------------------------------ 에코레버 7편 (사실표 범위, 재고 수량·출고 날짜 없음)
JOBS['2w-08-ecolever'] = eco(8, "에코백 50장, 얼마예요? — 장당 1칼라 1,000원·2칼라 1,200원(부가세 별도)", [
    escene('product-1color.jpg', "에코백 50장,\n얼마일까요?", focus=TOP1, e=2),
    escene('product-1color.jpg', "1칼라 장당 1,000원", "로고 인쇄 없음 · 부가세 별도", fit='blur', motion='zoomOut', e=1),
    escene('product-2color.jpg', "2칼라 장당 1,200원", "그레이·크림 투톤 · 부가세 별도", fit='blur', e=2),
    escene('product-1color.jpg', "1칼라 50장이면\n부가세 포함 55,000원", "수량과 관계없이 같은 장당 가격", focus=TOP1b, motion='panRight', e=3),
    escene('product-2color.jpg', "견적서 · 세금계산서 발행", "40×37cm · 약 70g", focus=TEX2, motion='panLeft', e=2),
], ('acoustic', 88), "에코백 50장, 얼마예요? | 장당 1,000원부터(부가세 별도)", ["에코백", "단체에코백", "에코백가격", "행사굿즈"], "brand-facts.md 가격(대표님 11/17)")

JOBS['2w-09-ecolever'] = eco(9, "1칼라 vs 2칼라 — 크림톤 단색과 그레이·크림 투톤", [
    escene('product-1color.jpg', "어떤 색이\n우리 행사에 맞을까요?", focus=TOP1, e=1),
    escene('product-1color.jpg', "1칼라 · 크림톤 단색", "실물 샘플을 먼저 받아 볼 수 있어요", fit='blur', motion='zoomOut', e=2),
    escene('product-2color.jpg', "2칼라 · 그레이·크림 투톤", "주문하시면 생산", fit='blur', e=2),
    escene('product-2color.jpg', "둘 다 40×37cm · 약 70g", "손잡이 40cm", focus=TEX2, motion='panLeft', e=2),
    escene('product-1color.jpg', "장당 1,000원 · 1,200원", "로고 인쇄 없이 50장부터 · 부가세 별도", focus=TOP1b, motion='panRight', e=3),
], ('calm', 80), "1칼라 vs 2칼라, 어떤 에코백이 맞을까요?", ["에코백", "단체에코백", "에코백추천", "행사굿즈"], "brand-facts.md")

JOBS['2w-10-ecolever'] = eco(10, "성적서로 말하는 에코백 — FITI 면 85.2%·황마 10.9%·레이온 3.9%, 합성섬유 0%", [
    escene('product-2color.jpg', "'친환경'이라는 말,\n근거가 있나요?", focus=TEX2, e=1),
    escene('doc-fiti-test.jpg', "FITI 시험성적서", "면 85.2% · 황마 10.9% · 레이온 3.9%", fit='blur', motion='zoomOut', e=2),
    escene('doc-fiti-test.jpg', "합성섬유 0%", "성적서 혼용률 기준", fit='blur', e=3),
    escene('product-1color.jpg', "면 · 황마 혼방 원단", "손에 닿는 결", focus=TOP1, motion='panRight', e=2),
    escene('product-2color.jpg', "성적서 사본을 함께 드려요", "결과 보고서·납품 서류에", focus=TOP2, motion='zoomOut', e=2),
], ('luxury', 76), "근거는 성적서에 | 면·황마 혼방 에코백, 합성섬유 0%", ["에코백", "시험성적서", "면황마", "친환경굿즈"], "FITI 시험성적서")

JOBS['2w-11-ecolever'] = eco(11, "기관·단체 구매 담당자 체크 — 견적서·세금계산서·여성기업 확인서", [
    escene('product-1color.jpg', "구매 담당자라면\n서류부터 보시죠", focus=TOP1, e=1),
    escene('doc-women-business-blur.jpg', "여성기업 확인서 보유", "기관 구매 때 확인하세요", fit='blur', motion='zoomOut', e=2),
    escene('product-2color.jpg', "견적서 · 세금계산서 발행", "통신판매업 신고 완료", focus=TEX2, motion='panLeft', e=2),
    escene('doc-fiti-test.jpg', "원단은 FITI 시험성적서로", "면 85.2% · 황마 10.9% · 레이온 3.9%", fit='blur', e=2),
    escene('product-1color.jpg', "로고 인쇄 없이 50장부터", "장당 1,000원 · 부가세 별도", focus=TOP1b, motion='panRight', e=3),
], ('corp', 92), "기관·단체 에코백 구매, 서류부터 확인하세요", ["에코백", "단체에코백", "기관구매", "여성기업"], "brand-facts.md · 여성기업 확인서")

JOBS['2w-12-ecolever'] = eco(12, "장바구니 쓰면 탄소중립포인트 — 참여 매장 회당 50원(cpoint.or.kr), 기념품은 다시 드는 가방", [
    escene('product-1color.jpg', "장바구니만 써도\n포인트가 쌓여요", focus=TOP1, e=2),
    escene('product-2color.jpg', "탄소중립포인트 '장바구니 이용'", "참여 매장에서 회당 50원 · cpoint.or.kr", focus=TEX2, motion='panLeft', e=1),
    escene('product-1color.jpg', "1인 연 최대 7만 원", "참여 매장인지 누리집에서 확인", fit='blur', e=2),
    escene('product-2color.jpg', "행사 기념품을\n다시 드는 장바구니로", fit='blur', motion='zoomOut', e=3),
    escene('product-1color.jpg', "로고 인쇄 없이 50장부터", "장당 1,000원 · 부가세 별도", focus=TOP1b, motion='panRight', e=2),
], ('acoustic', 90), "장바구니 쓰면 탄소중립포인트 | 기념품은 다시 드는 가방으로", ["탄소중립포인트", "장바구니", "에코백", "행사굿즈"], "한국환경산업기술원 탄소중립포인트(cpoint.or.kr) · brand-facts.md")

JOBS['2w-13-ecolever'] = eco(13, "로고 인쇄 없이 꾸미는 법 — 스티커·도장·손글씨(소량 행사용)", [
    escene('product-2color.jpg', "로고 없는 에코백,\n이렇게 꾸며 보세요", focus=TOP2, e=1),
    escene('product-1color.jpg', "스티커 · 도장 · 손글씨", "소량은 인쇄보다 비용·일정에 유리", focus=TOP1, motion='panRight', e=2),
    escene('guide-grant-top.png', "행사 이름·'○○ 지원' 표기도", "에코레버 구매 가이드", fit='blur', motion='zoomOut', e=2),
    escene('product-2color.jpg', "가방에 인쇄하려면\n10,000장부터", "에코레버 로고 인쇄 기준", focus=TEX2, motion='panLeft', e=2),
    escene('product-1color.jpg', "인쇄 없는 가방은 50장부터", "장당 1,000원 · 부가세 별도", fit='blur', e=3),
], ('lofi', 84), "로고 인쇄 없이 에코백 꾸미는 법 | 스티커·도장·손글씨", ["에코백꾸미기", "에코백", "행사굿즈", "단체에코백"], "에코레버 구매 가이드 · brand-facts.md")

JOBS['2w-14-ecolever'] = eco(14, "송년회·워크숍 기념품 — 받자마자 서랍행 말고 다시 드는 가방", [
    escene('product-1color.jpg', "송년회 기념품,\n올해는 뭘로 하죠?", focus=TOP1, e=2),
    escene('product-2color.jpg', "받자마자 서랍행 말고", "다음에도 들고 다니는 가방", focus=TEX2, motion='panLeft', e=1),
    escene('product-1color.jpg', "40×37cm · 약 70g", "손잡이 40cm · 면·황마 혼방", fit='blur', motion='zoomOut', e=2),
    escene('product-2color.jpg', "로고 인쇄 없이 50장부터", "1칼라 1,000원 · 2칼라 1,200원(부가세 별도)", fit='blur', e=3),
    escene('product-1color.jpg', "견적서 · 세금계산서 발행", "샘플을 먼저 받아 보세요", focus=TOP1b, motion='panRight', e=2),
], ('acoustic', 96), "송년회·워크숍 기념품 | 다시 드는 에코백, 50장부터", ["송년회", "워크숍", "기념품", "행사굿즈", "단체에코백"], "brand-facts.md")

for name, spec in JOBS.items():
    d = os.path.join(HERE, name)
    os.makedirs(d, exist_ok=True)
    with open(os.path.join(d, 'spec.json'), 'w', encoding='utf-8') as f:
        json.dump(spec, f, ensure_ascii=False, indent=2)
print(len(JOBS), 'specs')
