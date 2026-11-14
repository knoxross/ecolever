/* 영상뚝딱 — 브랜드 · 기능 켜고 끄기
 * 고도화(기능 추가·제거) 주문 시 이 파일에서 기능을 켜고 끌 수 있습니다.
 * false 로 바꾸면 해당 버튼·메뉴·창이 화면에서 사라집니다.
 * Copyright (c) (주)알앤케이그린월드. All rights reserved.
 */
'use strict';

const BRAND = {
  appName: '영상뚝딱',
  company: '(주)알앤케이그린월드',
  companyEn: 'R&K GREENWORLD Co., Ltd.',
  copyright: '© (주)알앤케이그린월드. All rights reserved.',
  website: 'https://www.ecolever.co.kr',
  version: '2.1.0',
};

const FEATURES = {
  aiEdit: true,       // ✨ Claude 로 사진 보고 자동 편집
  aiGenerate: true,   // 🎨 AI 사람·물건 사진 / 영상 생성
  voice: true,        // 🎙 내레이션 (AI 성우 · 녹음 · 톤)
  enhance: true,      // ✨ 화질 향상
  publish: true,      // 📈 업로드 도우미 (알고리즘 점검)
  series: true,       // 📺 시리즈 (컨셉 그대로 새 편 만들기)
  compress: true,     // 📦 용량 줄이기
  schedule: true,     // ⏰ 예약 만들기
  autolink: true,     // 🤖 자동화 연결 (작업 파일 → 영상, 다른 프로그램과 연결)
  music: true,        // 🎼 음악 만들기 (직접 작곡)
  project: true,      // 💾 프로젝트 저장 / 열기
  qa: true,           // 🔍 저장 전후 자동 검수
};
