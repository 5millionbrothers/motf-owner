# moTF 사장님·운영자 앱

숙소·마트 파트너와 moTF 운영팀이 업장, 객실·상품, 공실, 예약·주문, 정산과 사용자 콘텐츠를 관리하는 Next.js 앱입니다.

## 주요 기능

현재 운영 화면은 `public/owner/` 정적 앱입니다. `src/`는 차기 이전용이며 같은 기능을 양쪽에 중복 구현하지 않습니다.
최종 로고 포함본은 로그인·사이드바·로딩·파비콘에 새 심볼을 사용합니다. 차기 Next 화면에는 기능 변경 없이 로고·아이콘만 동기화합니다.
2026-11-03 로컬 디자인 V2는 기존 메인 배너 관리에 더해 `이벤트·배너·콘텐츠 → 공개 MT 기록` 심사를 제공합니다. `motf-database`의 86번 SQL을 먼저 적용합니다. 결제는 현 운영 NICEPAY 설정을 유지하며 아래 Toss 관련 설명은 이전 연동 기록입니다.

- KCP 휴대폰 본인확인을 거친 사장님 가입
- 국세청 사업자등록 상태·진위확인
- 업장·객실·상품·사진·부대시설·성수기·공실 관리
- 예약·주문 승인, 토스 결제 거절 환불, 정산 완료 처리
- 운영자 포인트·할인코드·캐시백·수수료·업장 노출 관리
- MOriginal, 카드뉴스, 팝업, Instagram, 커뮤니티, 레크레이션 관리
- 리뷰·커뮤니티 노출 관리, 문의·분쟁과 채팅 모니터링

숙소 추가 인원과 부대시설 금액은 현장 직접 결제 정책입니다. 예전 온라인 추가금 요청 UI는 제거했고 과거 DB 기록만 보존합니다.

## 환경변수

```text
NEXT_PUBLIC_SUPABASE_URL=https://프로젝트.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=Supabase publishable key
SUPABASE_SERVICE_ROLE_KEY=Supabase service_role key
DATA_GO_KR_SERVICE_KEY=공공데이터포털 국세청 사업자 진위확인 일반 인증키
TOSS_SECRET_KEY=숙소 MID 토스 시크릿 키(기존 변수명, 계속 사용 가능)
TOSS_MARKET_SECRET_KEY=장보기 MID 토스 시크릿 키
```

KCP 본인확인 API는 이용자 앱의 `https://motf.co.kr/api/identity-*`를 공용으로 사용합니다. 이용자 앱과 KCP 어댑터가 먼저 배포되어야 사장님 가입이 동작합니다.

## 로컬 실행

```bash
pnpm install
pnpm dev
```

검증은 `pnpm lint`와 `pnpm build`로 수행합니다. 환경변수의 비밀 키는 GitHub나 브라우저 코드에 저장하지 않습니다.
