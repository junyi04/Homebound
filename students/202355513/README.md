## 아키텍처

```text
사용자
  ↓
Route
  ↓
Service
  ↓
Lunch Vote Pod
  ├─ ConfigMap: 투표 질문 및 선택지 설정
  ├─ Secret: 관리자 비밀번호
  └─ PVC: 투표 결과 데이터 저장
```

### 사용 Object
- Deployment: Lunch Vote 애플리케이션 실행
- Service: Pod에 안정적인 내부 접근 제공
- Route: 외부에서 웹 서비스 접근
- ConfigMap: 일반 설정 관리
- Secret: 민감 정보 관리
- PVC: 투표 결과 영구 저장
- Liveness/Readiness Probe: 애플리케이션 상태 확인