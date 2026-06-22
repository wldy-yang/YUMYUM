# YUMYUM 🛵

> **"오늘도 배달 충동을 이겨내고, 내 지갑을 지키자!"** > 야식과 배달 음식의 유혹을 건강하게 해소하기 위한 **배달 충동 해소 전용 모의 주문 웹 서비스**입니다.

---

## 📖 프로젝트 소개

배달 앱을 켤 때의 그 설렘, **주문 과정만으로 해소할 수는 없을까?** 에서 출발한 프로젝트입니다.    
실제 배달 앱과 완벽하게 동일한 UI/UX(식당 선택 → 메뉴 장바구니 담기 → 결제 방식 선택 → 모의 주문)를 제공하지만,  
**실제 결제와 주문은 절대 이루어지지 않습니다.**   
주문을 참아낼 때마다 쌓이는 **'누적 절약 금액'**을 확인하고,  
친구들과 실시간으로 공유하며 서로의 지갑 수호자가 되어주세요!

<br>

## ✨ 주요 기능 (Key Features)

* **🛒 리얼한 모의 주문 체험**
  * 치킨, 피자, 초밥, 버거 등 4가지 카테고리의 식당과 메뉴 제공
  * 수량 조절 및 배달비가 포함된 실시간 장바구니 금액 계산
* **💰 누적 절약 리포트**
  * 모의 주문 완료 시 '절약한 금액', '참은 주문 횟수', '커피값 환산 잔 수' 시각화
  * 랜덤 동기부여 멘트 제공
* **👥 소셜 & 실시간 채팅 (Socket.IO)**
  * 유저 ID로 친구 추가 및 수락/거절 시스템
  * 친구가 현재까지 얼마를 절약했는지 실시간 랭킹 확인
  * **실시간 1:1 채팅**을 통해 "야식 참자" 서로 감시 및 동기부여 가능
* **🔒 안전한 커스텀 프로필**
  * 12가지 프로필 이모지 선택 가능
  * 실시간 4중 비밀번호 유효성 검사 로직 적용

<br>

## 🛠️ 기술 스택 (Tech Stack)

**Frontend** ![HTML5](https://img.shields.io/badge/html5-%23E34F26.svg?style=for-the-badge&logo=html5&logoColor=white) ![CSS3](https://img.shields.io/badge/css3-%231572B6.svg?style=for-the-badge&logo=css3&logoColor=white) ![JavaScript](https://img.shields.io/badge/javascript-%23323330.svg?style=for-the-badge&logo=javascript&logoColor=%23F7DF1E)

**Backend** ![Node.js](https://img.shields.io/badge/node.js-6DA55F?style=for-the-badge&logo=node.js&logoColor=white) ![Express.js](https://img.shields.io/badge/express.js-%23404d59.svg?style=for-the-badge&logo=express&logoColor=white)

**Real-time & Database** ![Socket.io](https://img.shields.io/badge/Socket.io-black?style=for-the-badge&logo=socket.io&badgeColor=010101) ![SQLite](https://img.shields.io/badge/sqlite-%2307405e.svg?style=for-the-badge&logo=sqlite&logoColor=white)

``` text
📦 YUMYUM
 ┣ 📂 public
 ┃ ┗ 📜 delivery-app.html  # 메인 프론트엔드 화면
 ┣ 📜 server.js            # 메인 백엔드 서버 및 Socket 로직
 ┣ 📜 yumyum.db            # SQLite 데이터베이스 파일
 ┗ 📜 package.json
 ```