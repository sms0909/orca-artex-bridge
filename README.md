# ARTEX ↔ Orca Codex 연결

## Local setup

1. Install Node.js and make the Orca CLI and Codex CLI available on `PATH`, or set their executable paths in `config.json`.
2. Copy `config.example.json` to `config.json`.
3. Generate a private gateway key and replace the example value:

   ```powershell
   $config = Get-Content config.json -Raw | ConvertFrom-Json
   $config.gatewayKey = node -e "process.stdout.write(require('crypto').randomBytes(32).toString('hex'))"
   $json = $config | ConvertTo-Json -Depth 8
   [System.IO.File]::WriteAllText((Join-Path $PWD 'config.json'), $json, [System.Text.UTF8Encoding]::new($false))
   ```

4. Start with `start.cmd` or `start.ps1`. `config.json`, request sandboxes, and smoke-test output are local-only and ignored by Git.

## 지금 사용할 화면

`http://localhost:8790/orca/`

1. 기존 ARTEX 관리자 비밀번호로 로그인한다. 비밀번호는 ARTEX 로그인 API로 전달되며 연결 서비스는 저장하지 않는다.
2. **Orca Codex 연결 활성화**를 누른다. `Orca Codex bridge` OpenAI 호환 프로파일이 추가·갱신되고 전역 활성 프로파일로 선택된다. 기존 다른 프로파일은 삭제하지 않는다.
3. 연결 상태·작업·발견 조회와 작업 일시정지를 사용할 수 있다. 나머지 기능은 대시보드·전체 작업 관리 링크로 접근한다.

Orca 안에는 `ARTEX · Orca 연결` 브라우저 탭을 열어 두었다. Orca의 AI에게 이 탭에서 연결 상태나 작업 목록을 확인하고 특정 작업을 일시정지하라고 지시할 수 있다. 비밀번호는 사용자가 입력하고, AI 대화에 적을 필요가 없다. 조회·정지 API는 기존 ARTEX 인증을 검증한다.

**현재 Orca 탭에서 ARTEX 로그인은 아직 완료되지 않았다. 따라서 ARTEX 프로파일 활성화도 아직 실행하지 않았다.** 관리자 인증을 우회하거나 DB를 직접 바꾸지 않았다. 계정 로그인을 완료하면 활성화 버튼이 지원되는 ARTEX API로 설정을 완료한다.

## 토큰 사용 방식

Orca가 선택한 Codex 계정의 `CODEX_HOME`을 경로로만 지정하고, 이미 로그인된 Codex CLI를 공식 비대화형 모드로 실행한다. OAuth access/refresh token 파일을 읽거나 복사하지 않는다. API 키 환경 변수는 자식 프로세스에서 제거해 별도 API 키 청구로 전환되지 않게 했다. 로그인 상태가 바뀌거나 사용량을 소진하면 호출은 실패한다. 2026-10-14 수정: 매 요청에서 Orca의 활성 로컬 Codex 계정을 조회한다. 계정을 바꾸면 다음 요청부터 적용되며 재시작이 필요 없다. 조회 실패 시 이전 계정으로 대체하지 않는다. 이미 시작한 요청은 시작 당시 계정을 사용한다. 토큰 값은 설정에 넣지 않는다.

`config.json`의 `gatewayKey`는 ARTEX→로컬 연결 서비스 인증용으로 생성한 별도 임의 키다. ChatGPT/Orca 계정 토큰이 아니다. 해당 파일은 현재 Windows 사용자와 SYSTEM만 접근하도록 ACL을 설정했다. 이 키는 관리자 인증 후 ARTEX 프로파일에 저장되며 화면이나 로그에 출력하지 않는다.

## AI 호환 범위

- The OpenAI-compatible profile remains `codex-default`; before activation the bridge reads the active Codex terminal model and reasoning effort, runs a real minimal Codex request with those explicit settings, and only activates the profile if that request succeeds. `/orca/status` and the configure response report the verified model, effort, account ID, and check time. Each ARTEX inference re-reads the active Orca model and passes it explicitly to `codex exec`.
- 텍스트 대화와 JSON function 호출을 지원한다. 전체 전달된 대화와 도구 선언을 구조화된 모델 출력으로 변환한다.
- 도구 호출은 ARTEX에 돌려주며 연결 서비스에서 실행하지 않는다. 기존 ARTEX 실행·승인 경로를 사용한다.
- Codex의 shell/unified_exec/apps/multi_agent와 웹 검색을 비활성화하고, 사용자 설정·실행 규칙을 로드하지 않는 read-only ephemeral 모드를 사용한다. 연결 과정에서 공격 작업은 생성하지 않았다.
- SSE 호환 응답을 제공하지만 토큰별 실시간 출력은 아니다. 모델 응답이 끝난 뒤 내용을 전달한다.
- 이미지·파일 입력, 직접 Responses API, 임의 모델 선택은 지원하지 않는다. 지원하지 않는 입력은 명시적으로 거부한다.
- 별도 Codex 실행이므로 같은 입력을 직접 API에 보내는 것보다 지연과 입력 토큰 오버헤드가 크다. 동시 요청은 1개이며 추가 요청은 429로 응답한다.
- 기존 모델 프로파일이 특정 Agent/작업에 고정되어 있다면 전역 활성값 변경만으로 그 Agent/작업까지 바뀌지는 않는다. 해당 화면에서 Orca 프로파일을 선택해야 한다.

이는 원본 제공자를 비트 단위로 동일하게 구현한 것이 아니다. 기존 데이터·승인·도구 코드는 변경하지 않은 연결 어댑터이며, 원본 ARTEX의 보안 위험을 제거하지 않는다.

## 실행 구조와 관리

- 원본 ARTEX: `http://localhost:8787`
- 검토판 UI 및 Orca 제어: `http://localhost:8790`, `/orca/`
- 호스트 연결 서비스: `127.0.0.1:8792` (외부 인터페이스로 공개하지 않음)
- ARTEX 컨테이너의 연결 주소: `http://host.docker.internal:8792/v1`
- Orca 관리 터미널 제목: **ARTEX Orca 연결**

Orca 터미널에서 `C:\codex\orca-artex-bridge\start.cmd`로 시작한다. 서비스가 이미 실행 중이면 두 번 시작하지 않는다. 터미널에서 Ctrl+C로 중지할 수 있다. Windows 부팅 자동 실행은 등록하지 않았다. Docker Desktop과 원본 ARTEX 및 검토판 UI도 실행 중이어야 한다.

## 검증

2026-10-14: 기존 Codex CLI `0.162.1`, `Logged in using ChatGPT` 확인. 실제 계정으로 무해한 연결 확인과 가상 read_asset 도구 요청을 실행해 JSON 응답 및 SSE 변환을 확인했다. 가상 도구는 실제로 실행하지 않았다.

- 로컬 모델 API: 인증 없는 요청 401.
- 제어 API: 인증 없는 요청 401.
- 실제 응답: `연결 확인`.
- 실제 function 출력: `read_asset`, `{"id":1}`; SSE `[DONE]` 확인.
- 단위 테스트 6개 통과: 미선언 도구·잘못된 인자·tool_choice 위반·이미지 입력 거부 및 텍스트/토큰 변환.
- Docker 안에서 호스트 연결 서비스 health 조회 성공.
- `/orca/` HTTP 200 및 Orca 브라우저의 한국어 제어 화면 확인.
- 원본 보호 파일 558개 SHA256 불변.

기존 ARTEX 비밀번호가 제공되지 않았으므로 인증 후 프로파일 저장·실제 ARTEX LLM 테스트·실대상 자율 작업은 실행하지 않았다. 모델은 요청의 정책·내용에 따라 거절할 수 있으며 거절을 우회하지 않는다.

공식 비대화형 Codex 문서: https://learn.chatgpt.com/docs/non-interactive-mode


### Bridge request concurrency

The bridge allows up to two simultaneous Codex requests (maxConcurrentCalls=2 in config.json). This is independent of ARTEX global simultaneous-task setting. Turning that ARTEX setting off does not change the bridge limit; set maxConcurrentCalls=1 and restart the bridge to restore serial calls. ARTEX profile limits remain 1 request/second and 6 requests/minute.
