# 에코레버 SNS 프로필 묶음 (2026-11-25)

대표님이 계정 이름을 바꾼 뒤 그대로 붙여 넣는 자료입니다. 이 폴더는 공개 저장소에 있어도 되는 내용만 둡니다(홈페이지 배포 목록에는 들어가지 않음).
사실은 brand-facts.md와 홈페이지 기준입니다. 재고 수량·출고 날짜·고가 가방·생분해 표현은 넣지 않았습니다.

| 플랫폼 | 지금 | 바꿀 이름 | 프로필 링크 |
|---|---|---|---|
| 인스타그램 | evanross0928 | ecolever.official | https://www.ecolever.co.kr/?utm_source=instagram&utm_medium=social&utm_campaign=profile |
| 틱톡 | rnkr10 | ecolever | https://www.ecolever.co.kr/?utm_source=tiktok&utm_medium=social&utm_campaign=profile |
| 유튜브 | @RNK-u9h | @ecolever | https://www.ecolever.co.kr/?utm_source=youtube&utm_medium=social&utm_campaign=profile |
| 네이버 블로그 | rknox (주소는 그대로) | 블로그명 '에코레버 ECOLEVER' | https://www.ecolever.co.kr/?utm_source=naverblog&utm_medium=social&utm_campaign=profile |

링크 끝의 utm 값은 GA4에서 어느 SNS로 들어왔는지 보려고 붙였습니다.

## 이미지
- `profile-1080.png` — 프로필 사진(1080×1080). 네 곳 모두 같은 이미지를 씁니다. 원형으로 잘려도 로고가 안에 들어갑니다.
- `youtube-banner-2560x1440.png` — 유튜브 배너. 글자는 모든 기기에서 보이는 가운데 1546×423 안에 있습니다.
- 원본 HTML은 `src/`에 있습니다. 고치면 Edge 헤드리스로 다시 찍습니다.

## 인스타그램
- 이름 (22자 / 한도 30자)
- 소개 (101자 / 한도 150자)
```
면·황마 혼방 에코백 단체 주문
인쇄 없이 50개부터 · 장당 1,000원~(VAT 별도)
로고 인쇄 10,000개부터
여성기업 · 견적서·세금계산서 발행
☎ 02-6368-9989
```

## 틱톡
- 이름 (13자 / 한도 30자)
- 소개 (47자 / 한도 80자)
```
면·황마 혼방 에코백 | 단체 50개부터 | 여성기업 | 문의 02-6368-9989
```

## 유튜브
- 채널 이름 (13자 / 한도 100자)
- 설명 (347자 / 한도 1000자)
```
면·황마 혼방 에코백을 만드는 에코레버(주식회사 알앤케이그린월드)입니다.
행사·캠페인·판촉용 에코백을 단체로 공급합니다.

· 원단: FITI 시험성적서 기준 면 85.2% · 황마 10.9% · 레이온 3.9%
· 크기: 40×37cm 약 70g, 손잡이 40cm
· 가격: 인쇄 없는 가방 장당 1칼라 1,000원 · 2칼라 1,200원(부가세 별도)
· 주문: 인쇄 없이 50개부터, 로고 인쇄 10,000개부터
· 서류: 여성기업 확인서, 견적서·세금계산서 발행

견적 문의: https://www.ecolever.co.kr/#inquiry
전화 02-6368-9989 · 메일 knox@ecolever.co.kr
```
- 링크 추가: '홈페이지' → https://www.ecolever.co.kr/?utm_source=youtube&utm_medium=social&utm_campaign=profile

## 네이버 블로그
- 블로그명 (13자)
- 별명 (4자)
- 소개글 (87자)
```
면·황마 혼방 에코백 에코레버입니다. 단체 주문 50개부터, 로고 인쇄 10,000개부터. 여성기업 · 견적서·세금계산서 발행. 문의 02-6368-9989
```
- 블로그명·별명·소개글 글자 한도는 네이버 관리 화면에서 확인해 주세요(Claude가 화면을 보지 못함).

## 이름을 바꾼 뒤 (에코레버/총괄이 할 일)
- 홈페이지(index.html)의 SNS 링크 3곳(인스타·틱톡·유튜브), Organization JSON-LD의 sameAs, QR코드 이미지(qr-instagram·qr-tiktok·qr-youtube)를 새 주소로 바꾸는 PR을 냅니다. 옛 아이디 주소는 바뀐 뒤 열리지 않을 수 있습니다.
- 대표님이 바꿨다고 알려 주시면 바로 진행합니다.
