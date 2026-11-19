# [금강공업] 사내 ERP ➔ 시험성적의뢰 포털 다이렉트 연동 API 명세서

- **문서 버전:** v1.0.0 (공식 배포본)
- **최종 개정일:** 2026-11-17
- **수신:** 금강공업 전산실(IT팀), ERP 개발업체 / 유지보수팀
- **발신:** 금강공업 품질관리팀
- **목적:** 사내 ERP 시스템에서 시험성적서 결재가 완료되는 즉시, 포털 시스템으로 공인 성적서 PDF를 전송하여 거래처에 실시간 발송 완료 및 다운로드 처리를 자동화하기 위함.

---

## 1. 시스템 연동 아키텍처 (Workflow)

```
[1. 거래처 / 현장]       [2. 금강공업 품질팀]            [3. 사내 ERP 시스템]            [4. 시험성적 포털 API]
      │                          │                               │                              │
      ├──── 1) 시험성적의뢰 ────>│                               │                              │
      │    (포털에 접수 등록)    │                               │                              │
      │    의뢰번호: REQ-001     ├──── 2) ERP에 시험결과 입력 ──>│                              │
      │                          │                               ├─ 3) 최종 결재 승인           │
      │                          │                               ├─ 4) 성적서 PDF 자동생성      │
      │                          │                               │                              │
      │                          │                               ├──── 5) POST /api/erp ───────>│ [성적서 수신 API]
      │                          │                               │        (PDF Base64 전송)     │
      │                          │                               │<─── 6) 200 OK 응답 ──────────┤
      │                          │                               │                              │ 7) 상태 자동 전환:
      │                          │                               │                              │    'completed'(발송완료)
      │<──────────────────────── 8) 공인 성적서 PDF 실시간 다운로드 가능 ───────────────────────┤
```

---

## 2. 기본 접속 정보 & 네트워크 환경

| 구분 | 접속 URL (Endpoint) | 비고 |
| :--- | :--- | :--- |
| **사내망 (내부 인트라넷)** | `http://172.16.2.115:3000` | 사내 ERP 서버와 직접 통신 시 권장 (속도 최상, 보안 안전) |
| **외부망 (Cloudflare 터널)** | `https://jews-considers-software-frequencies.trycloudflare.com` | 외부 데이터센터나 클라우드 ERP 연동 시 사용 |
| **보안 인증 헤더** | `X-ERP-API-KEY: KUMKANG-ERP-SECRET-2026` | 필수 헤더 (미입력 또는 불일치 시 401 거부) |
| **데이터 형식** | `application/json; charset=utf-8` | 요청 및 응답 공통 |

---

## 3. API 인터페이스 상세 규격

### 3.1. [GET] ERP 게이트웨이 상태 확인 (Health Check)
ERP 서버에서 포털 서버와의 네트워크 및 서비스 구동 상태를 사전 점검할 때 사용합니다.

- **URL:** `/api/erp/ping`
- **Method:** `GET`
- **인증 필요 여부:** 불필요 (Public)
- **응답 샘플 (200 OK):**
```json
{
  "status": "online",
  "service": "Kumkang Kind Test Report Portal - ERP Gateway API",
  "version": "1.0.0",
  "serverTime": "2026-11-17T04:54:24.676Z",
  "authRequiredHeader": "X-ERP-API-KEY"
}
```

---

### 3.2. [POST] 성적서 PDF 자동 전송 및 발송완료 처리 (Main API)
ERP에서 성적서 최종 결재가 승인되었을 때, 생성된 성적서 PDF 바이너리를 Base64로 인코딩하여 포털로 전송합니다.

- **URL:** `/api/erp/upload-report`
- **Method:** `POST`
- **Request Headers:**
  ```http
  Content-Type: application/json
  X-ERP-API-KEY: KUMKANG-ERP-SECRET-2026
  ```

#### 요청 파라미터 (Request JSON Body)

| 파라미터명 | 타입 | 필수여부 | 설명 | 예시 |
| :--- | :---: | :---: | :--- | :--- |
| `requestId` | String | 조건부 필수 | 포털의 시험성적의뢰 접수번호 (REQ-YYYYMMDD-XXX). `lotNo` 중 하나는 반드시 포함되어야 함 | `"REQ-20261117-005"` |
| `lotNo` | String | 조건부 필수 | 코일/밀시트 번호 또는 LOT 번호 (`requestId`를 모를 경우 LOT번호로 자동 매칭) | `"5A123-B"` |
| `fileName` | String | **필수** | 저장될 성적서 PDF 파일명 (확장자 `.pdf` 포함) | `"금강공업_공인성적서_REQ-20261117-005.pdf"` |
| `fileData` | String | **필수** | **Base64로 인코딩된 실제 PDF 파일 바이너리 문자열** | `"JVBERi0xLjQKJ..."` |
| `approver` | String | 선택 | ERP 결재자 성명 및 직책 (생략 시 기본 품질승인자로 표기) | `"품질관리팀 하지현 팀장"` |
| `adminNotes` | String | 선택 | ERP 시스템 결재 의견 또는 규격 적합 메모 | `"KS D 3568 규격 합격 판정 완료"` |

#### 요청 샘플 (Request Example)
```json
{
  "requestId": "REQ-20261117-005",
  "fileName": "금강공업_공인성적서_TR-20261117.pdf",
  "fileData": "JVBERi0xLjQKMSAwIG9iago8PCAvVHlwZSAvQ2F0YWxvZyAvUGFnZXMgMiAwIFIgPj4KZW5kb2JqCjIgMCBvYmoKPDwgL1R5cGUgL1BhZ2VzIC9LaWRzIFszIDAgUl0gL0NvdW50IDEgPj4KZW5kb2Jq...",
  "approver": "품질관리팀 하지현 팀장",
  "adminNotes": "사내 ERP 결재 완료 연동 ➔ 공인 시험성적서 첨부 완료 (합격)"
}
```

#### 성공 응답 (200 OK)
성공적으로 수신되면 즉시 포털 내 해당 의뢰서의 상태가 `completed` (발송완료)로 자동 갱신됩니다.
```json
{
  "success": true,
  "message": "ERP 성적서가 포털에 성공적으로 등록되었으며 거래처로 즉시 발송완료 처리되었습니다.",
  "data": {
    "requestId": "REQ-20261117-005",
    "clientName": "상운철강",
    "demandUser": "",
    "status": "completed",
    "reportFileName": "금강공업_공인성적서_TR-20261117.pdf",
    "approver": "품질관리팀 하지현 팀장",
    "completedAt": "2026-11-17T05:12:00.000Z"
  }
}
```

#### 에러 응답 코드
- **`400 Bad Request`**: 필수 파라미터(`fileName`, `fileData`) 누락 시
- **`401 Unauthorized`**: `X-ERP-API-KEY` 인증 헤더가 누락되었거나 틀렸을 때
- **`404 Not Found`**: 전달받은 `requestId` 또는 `lotNo`와 일치하는 의뢰서가 포털에 없을 때
- **`500 Internal Server Error`**: 서버 디스크 저장 실패 등 내부 에러 발생 시

---

## 4. ERP 시스템 개발사 연동 소스 코드 샘플

전산실 개발자 또는 ERP 구축 업체에서 바로 복사하여 사용할 수 있는 언어별 연동 코드입니다.

### 4.1. C# (.NET Framework / C# ERP / Douzone / 영림원 연동)
```csharp
using System;
using System.IO;
using System.Net.Http;
using System.Text;
using System.Threading.Tasks;

public class KumkangErpReportSender
{
    private static readonly HttpClient client = new HttpClient();
    
    // 사내망 URL (운영 환경에 맞게 선택)
    private const string ApiUrl = "http://172.16.2.115:3000/api/erp/upload-report";
    private const string ApiKey = "KUMKANG-ERP-SECRET-2026";

    public static async Task<bool> SendReportToPortal(string requestId, string pdfFilePath, string approverName)
    {
        try
        {
            // 1. PDF 파일을 바이트로 읽고 Base64 인코딩
            byte[] fileBytes = File.ReadAllBytes(pdfFilePath);
            string base64String = Convert.ToBase64String(fileBytes);
            string fileName = Path.GetFileName(pdfFilePath);

            // 2. JSON Payload 구성
            var payload = new
            {
                requestId = requestId,
                fileName = fileName,
                fileData = base64String,
                approver = approverName,
                adminNotes = "ERP 최종 결재 완료 연동 (자동 전송)"
            };

            string jsonContent = System.Text.Json.JsonSerializer.Serialize(payload);
            var requestMessage = new HttpRequestMessage(HttpMethod.Post, ApiUrl);
            requestMessage.Headers.Add("X-ERP-API-KEY", ApiKey);
            requestMessage.Content = new StringContent(jsonContent, Encoding.UTF8, "application/json");

            // 3. 포털 API 호출
            HttpResponseMessage response = await client.SendAsync(requestMessage);
            string responseBody = await response.Content.ReadAsStringAsync();

            if (response.IsSuccessStatusCode)
            {
                Console.WriteLine("[성공] 포털 성적서 자동 등록 및 거래처 발송 완료: " + responseBody);
                return true;
            }
            else
            {
                Console.WriteLine("[오류] 전송 실패 (상태코드: " + response.StatusCode + "): " + responseBody);
                return false;
            }
        }
        catch (Exception ex)
        {
            Console.WriteLine("[예외] ERP 연동 중 에러 발생: " + ex.Message);
            return false;
        }
    }
}
```

---

### 4.2. Python (ERP 백엔드 서비스 / 자동 배치 스크립트)
```python
import base64
import requests

API_URL = "http://172.16.2.115:3000/api/erp/upload-report"
API_KEY = "KUMKANG-ERP-SECRET-2026"

def upload_test_report(request_id, pdf_path, approver="품질관리팀 하지현 팀장"):
    # 1. PDF 읽기 및 Base64 변환
    with open(pdf_path, "rb") as f:
        file_bytes = f.read()
        file_base64 = base64.b64encode(file_bytes).decode('utf-8')
    
    file_name = pdf_path.split("/")[-1].split("\\")[-1]

    # 2. 전송 요청
    headers = {
        "Content-Type": "application/json",
        "X-ERP-API-KEY": API_KEY
    }
    payload = {
        "requestId": request_id,
        "fileName": file_name,
        "fileData": file_base64,
        "approver": approver,
        "adminNotes": "사내 ERP 결재 완료 연동 (자동 발송)"
    }

    res = requests.post(API_URL, json=payload, headers=headers)
    print(f"응답 코드: {res.status_code}")
    print(f"응답 내용: {res.json()}")
    return res.status_code == 200

# 실행 예시:
# upload_test_report("REQ-20261117-005", "D:/ERP_Output/금강공업_성적서_5호.pdf")
```

---

### 4.3. Java / Spring Boot (전자정부 프레임워크 ERP)
```java
import java.io.File;
import java.nio.file.Files;
import java.util.Base64;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;

public class ErpReportClient {
    private static final String API_URL = "http://172.16.2.115:3000/api/erp/upload-report";
    private static final String API_KEY = "KUMKANG-ERP-SECRET-2026";

    public static void sendReport(String requestId, File pdfFile, String approver) throws Exception {
        byte[] fileBytes = Files.readAllBytes(pdfFile.toPath());
        String base64Data = Base64.getEncoder().encodeToString(fileBytes);

        String json = String.format("{\"requestId\":\"%s\",\"fileName\":\"%s\",\"fileData\":\"%s\",\"approver\":\"%s\"}",
                requestId, pdfFile.getName(), base64Data, approver);

        HttpClient client = HttpClient.newHttpClient();
        HttpRequest request = HttpRequest.newBuilder()
                .uri(URI.create(API_URL))
                .header("Content-Type", "application/json")
                .header("X-ERP-API-KEY", API_KEY)
                .POST(HttpRequest.BodyPublishers.ofString(json))
                .build();

        HttpResponse<String> response = client.send(request, HttpResponse.BodyHandlers.ofString());
        System.out.println("응답: " + response.body());
    }
}
```

---

### 4.4. cURL (터미널 즉시 테스트용)
```bash
curl -X POST "http://172.16.2.115:3000/api/erp/upload-report" \
  -H "Content-Type: application/json" \
  -H "X-ERP-API-KEY: KUMKANG-ERP-SECRET-2026" \
  -d '{
    "requestId": "REQ-20261117-005",
    "fileName": "TEST_REPORT.pdf",
    "fileData": "JVBERi0xLjQK...",
    "approver": "하지현 팀장"
  }'
```

---

## 5. 문의 및 기술 지원

- **담당 부서:** 금강공업 품질관리팀 / 포털 개발 운영팀
- **사내 전화:** 내선 번호 품질관리팀 하지현 (또는 전산실)
- **포털 관리자 콘솔:** 포털 접속 후 우측 상단 `[🏢 사내 ERP 연동 API]` 버튼을 누르면 실시간 시뮬레이터로 통신 상태를 즉시 테스트해볼 수 있습니다.
