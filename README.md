# 🛡️ Velclaw Hosting Platform & Control Plane

> **Hệ thống Quản lý Dịch vụ Lưu trữ Web, Giám sát Hạ tầng Thời gian thực & Điều phối Tên miền Tự động (Domain & Deployment Control Plane).**

---

## 📌 Mục Lục

- [1. Giới Thiệu Tổng Quan](#1-giới-thiệu-tổng-quan)
- [2. Kiến Trúc Domain Hiện Tại](#2-kiến-trúc-domain-hiện-tại)
- [3. Kiến Trúc VelclawHost Control Plane](#3-kiến-trúc-velclawhost-control-plane)
- [4. Các Tính Năng & Phân Hệ Trọng Yếu](#4-các-tính-năng--phân-hệ-trọng-yếu)
- [5. Cấu Trúc Mã Nguồn (Project Structure)](#5-cấu-trúc-mã-nguồn-project-structure)
- [6. Hướng Dẫn Cài Đặt & Vận Hành Chi Tiết](#6-hướng-dẫn-cài-đặt--vận-hành-chi-tiết)
- [7. Hướng Dẫn Cấu Hình DNS & Ingress Reverse Proxy Mẫu](#7-hướng-dẫn-cấu-hình-dns--ingress-reverse-proxy-mẫu)
- [8. Biến Môi Trường (Environment Variables)](#8-biến-môi-trường-environment-variables)
- [9. Giấy Phép & Đóng Góp](#9-giấy-phép--đóng-góp)

---

## 1. Giới Thiệu Tổng Quan

**Velclaw Hosting Platform** là giải pháp quản trị hạ tầng Cloud & Server thế hệ mới, kết hợp bảng điều khiển giám sát tài nguyên máy chủ thời gian thực (Real-time Metrics), trung tâm kiểm soát DNS Anycast, tự động hóa chứng chỉ SSL/TLS 1.3 Let's Encrypt, bảo mật đa yếu tố (2FA TOTP), tối ưu hóa cơ sở dữ liệu và tích hợp Trợ lý Trí tuệ Nhân tạo **Gemini 3.8 Flash** điều khiển bằng giọng nói.

---

## 2. Kiến Trúc Domain Hiện Tại

VelclawHost quản lý namespace first-party của Velclaw với **`velclaw.site`** làm platform chính, **`velclaw.dev`** cho developer và **`velclaw.app`** cho application. `velclaw.ai` đã loại khỏi namespace canonical; `velclaw.cfd` là legacy redirect; `.com` chỉ được dùng sau khi ownership/DNS được xác minh.

```text
VELCLAW ECOSYSTEM
      │
      └── velclaw.app
          ├── https://velclaw.app
          ├── https://velclaw.app/docs
          ├── https://velclaw.app/api/*
          └── https://*.velclaw.app
```

| Namespace | Trạng thái | Vai trò |
| :--- | :--- | :--- |
| **`velclaw.site`** | **PRIMARY PLATFORM** | Platform / Company. `velclaw.dev` là developer surface và `velclaw.app` là application surface. |
| `.com` / `.ai` / `.dev` / `.io` / `.app` | **FUTURE MIGRATION** | Chỉ giữ làm mục tiêu khi có domain chính thức và kế hoạch migration. |

## 3. Kiến Trúc VelclawHost Control Plane

**VelclawHost** đóng vai trò là tầng trung gian điều phối giữa Core Platform Velclaw, Nhà cung cấp DNS (Cloudflare API), Cổng Ingress Reverse Proxy và Runtime Containers:

```
VELCLAW CORE (UI / CLI)
          │
          │ Deploy Spec (Git Hash / Docker Image / Env)
          ▼
   VELCLAWHOST API (Control Plane)
          │
  ┌───────┼────────────────────────────────────────┐
  ▼       ▼                                        ▼
 DNS    Proxy Routing                            TLS / SSL
  │       │                                        │
  ▼       ▼                                        ▼
Cloudflare Caddy / Nginx Ingress              Let's Encrypt (ACME)
(Wildcard) (Dynamic Host Header Route)        (Auto-renew DNS-01)
  │       │                                        │
  └───────┼────────────────────────────────────────┘
          ▼
   Running Container Workloads
   ├── app-frontend   (Port 3000 -> https://project.velclaw.app)
   ├── preview-branch (Port 3001 -> https://feat-auth.velclaw.app)
   └── ai-agent-core  (Port 8080 -> https://inference.velclaw.app)
```

### Điểm Vượt Trội Của Kiến Trúc Này:
1. **Wildcard DNS Tĩnh + Dynamic Host Matching**: Không cần liên tục gọi Cloudflare API tạo từng record con, loại bỏ giới hạn rate-limit và thời gian chờ DNS propagation.
2. **Zero-Downtime Deployment**: Chuyển đổi upstream proxy tức thì sau khi container mới vượt qua kỳ kiểm tra sức khỏe (Health Check).
3. **Tự Động Cấp Phát & Gia Hạn SSL**: Tích hợp giao thức ACME tự động cấp chứng chỉ Wildcard `*.[domain]` và bật chuẩn HSTS Preload.

---

## 4. Các Tính Năng & Phân Hệ Trọng Yếu

### 🌐 4.1. Quản Lý Tên Miền Tùy Chỉnh (Domain Management Tab)
- **Cấu hình tên miền độc lập**: Cho phép người dùng kết nối tên miền riêng vào hạ tầng VelclawHost trên namespace first-party hiện tại `velclaw.site`, `velclaw.dev`, `velclaw.app` và custom domains.
- **Trường nhập liệu & Cấu hình DNS**:
  - *Tên miền (Domain Name)*: Kiểm tra cú pháp thời gian thực, phát hiện và gán huy hiệu nhận diện TLD tức thì (.COM, .DEV, .AI, .IO, .APP).
  - *Loại bản ghi DNS*: Hỗ trợ bản ghi **A** (trỏ tới địa chỉ IPv4 máy chủ edge) và **CNAME** (trỏ tới Ingress Hostname alias).
  - *Giá trị IP / Host*: Tích hợp logic kiểm tra định dạng IPv4 chuẩn 4-octets hoặc Hostname FQDN hợp lệ kèm nút gán nhanh IP/Host mặc định.
  - *Ghi chú mục đích sử dụng*: Phân loại môi trường (Production, Staging Preview, AI Inference Cluster, Mobile API...).
- **Trạng thái DNS & Vòng đời xác thực**:
  - **Đang hoạt động (Active)**: Bản ghi DNS đã lan truyền và phân giải chính xác tới hạ tầng máy chủ, kích hoạt chứng chỉ SSL TLS 1.3 Let's Encrypt.
  - **Chờ duyệt (Pending)**: Bản ghi vừa tạo hoặc đang chờ người dùng cập nhật bản ghi tại nhà cung cấp tên miền (Registrar).
  - **Xác thực tự động (Verify DNS)**: Thực hiện kiểm tra Anycast tức thời và chuyển trạng thái sang Active khi bản ghi khớp.
- **Bảng hướng dẫn ủy quyền DNS (DNS Delegation Guide)**: Hướng dẫn chi tiết giá trị Host, Type, Target Value và TTL cho từng tên miền tại Cloudflare, Namecheap, GoDaddy.

### 🌐 4.2. Quản Lý DNS Anycast & SSL (Tab DNS & SSL)
- **Quản lý namespace first-party `velclaw.site`, `velclaw.dev`, `velclaw.app`**: Cho phép cấu hình độc lập bảng bản ghi DNS (*A, AAAA, CNAME, TXT, CAA, NS*) cho `velclaw.app` và các custom domains được người dùng cấu hình.
- **Chuyển đổi Proxy Cloudflare Edge**: Bật/tắt chế độ giấu IP gốc (Orange Cloud Proxied vs. Gray Cloud DNS-only) chỉ với 1-click.
- **Kiểm Tra Phân Giải Toàn Cầu (Global Anycast Propagation)**: Kiểm tra trạng thái phản hồi DNS đồng thời tại 6 khu vực trọng yếu: Tokyo (NRT), Singapore (SIN), Frankfurt (FRA), London (LHR), Ashburn (IAD), Sydney (SYD).
- **Cấu hình Nginx Ingress & HSTS**: Tự động chuyển hướng HTTP 301 sang HTTPS và thiết lập `Strict-Transport-Security: max-age=31536000; includeSubDomains; preload`.

### 📊 4.3. Giám Sát Tài Nguyên & Lọc Dữ Liệu Lịch Sử Linh Hoạt (Charts Tab)
- **Dropdown chọn phạm vi thời gian (Time Range Dropdown)**:
  - Cho phép người dùng chuyển đổi linh hoạt giữa các khung thời gian:
    - *Thời gian thực (Live 15m)*: Cập nhật trực tiếp mỗi 2.5 giây từ máy chủ edge.
    - *1 Giờ qua (1h)*: 30 điểm mẫu đo lường, độ phân giải 2 phút / mẫu.
    - *6 Giờ qua (6h)*: 36 điểm mẫu đo lường, độ phân giải 10 phút / mẫu.
    - *12 Giờ qua (12h)*: 36 điểm mẫu đo lường, độ phân giải 20 phút / mẫu.
    - *24 Giờ qua (24h)*: 48 điểm mẫu đo lường, độ phân giải 30 phút / mẫu, phản ánh chu kỳ ngày đêm.
  - Tích hợp cụm nút chuyển nhanh 1-click (**Quick Pills: Live, 1h, 6h, 12h, 24h**), nút Làm mới dữ liệu lịch sử và nút quay lại Real-time stream tức thì.
  - Tự động tính toán lại các chỉ số trung bình (Average) và đỉnh (Peak) của CPU, RAM, Network, Latency theo đúng tập dữ liệu của khung thời gian đang chọn.
- **6 Biểu đồ chỉ số chuyên sâu**:
  1. *CPU Utilization (%)*: Đường phân tích ngưỡng Warning (75%) và Critical (85%).
  2. *Bộ nhớ RAM (GB & %)*: So sánh dung lượng đã dùng (Used) và bộ nhớ trống (Free).
  3. *Băng thông Mạng (Mbps)*: Dual-stream đo lưu lượng Inbound (Rx) và Outbound (Tx).
  4. *Disk I/O Operations (IOPS)*: Đo tốc độ đọc/ghi ổ cứng thể rắn NVMe SSD.
  5. *Phân bổ tải theo từng Lõi CPU (Cores 0 - 3)*: Biểu đồ đa màu nhận diện lõi chịu tải lệch.
  6. *Độ trễ P95 HTTP & Sockets*: Theo dõi SLA phản hồi (ms) và số lượng kết nối đồng thời.
- **Nút "Phóng To" (Fullscreen Modal)**: Cho phép mở rộng bất kỳ biểu đồ nào ra toàn màn hình với thống kê Peak, Min, Average, danh sách mẫu gần nhất và khuyến nghị DevOps tương ứng, đồng bộ bộ lọc thời gian trực tiếp trong chế độ toàn màn hình.
- **Biểu đồ Heatmap Ma Trận Lưu Lượng Mạng 7x24 Giờ (7x24 Network Traffic Heatmap)**:
  - *Ma trận 168 giờ*: Trực quan hóa toàn diện 7 ngày trong tuần x 24 khung giờ mỗi ngày với thang màu quang phổ nhiệt độ Continuous DevOps (từ Off-peak xanh sẫm đến Grand Peak đỏ hồng).
  - *Chế độ xem đa chiều (Metric Modes)*: Chuyển đổi linh hoạt giữa Tổng băng thông (Total Rx+Tx), Tải vào (Inbound Rx), Tải ra (Outbound Tx), và Tần suất truy vấn (Requests/giây).
  - *Phát hiện Khung giờ cao điểm & Patterns*: Tự động định vị khung giờ đỉnh tải tuần (Top Peak Window), tỷ lệ giờ cao điểm, và đề xuất cửa sổ bảo trì hệ thống lý tưởng (Off-peak Maintenance Window 02:00 - 05:00).
  - *Bộ lọc linh hoạt & Tương tác chuyên sâu*: Hỗ trợ lọc theo Ngày làm việc (T2-T6), Cuối tuần (T7-CN), nút Glow làm nổi bật giờ cao điểm (>700 Mbps), và bảng phân tích chi tiết từng cell khi click/hover.
- **24H Peak Timeline**: Trục dòng thời gian phân giải cao quét các mốc tải đỉnh trong 24 giờ.

### 🚨 4.3. Cảnh Báo & Giả Lập Đột Biến (Alerts Tab & FCM Modal)
- Theo dõi danh sách cảnh báo phân cấp theo mức độ: *Critical (Đỏ)*, *Warning (Vàng)*, *Info (Lam)*.
- Cho phép điều chỉnh ngưỡng kích hoạt cảnh báo trực quan bằng thanh trượt.
- **Nút giả lập đột biến tải (Test Spike)**: Đẩy tải giả lập để kiểm thử luồng thông báo đẩy Web Push / Firebase Cloud Messaging (FCM).

### 🗄️ 4.4. Tối Ưu Hóa Cơ Sở Dữ Liệu (DB Optimization Tab)
- Tự động nhận diện các truy vấn chậm (Slow Queries > 100ms) trên MySQL/PostgreSQL.
- Đề xuất câu lệnh tạo chỉ mục `CREATE INDEX` tối ưu hóa thời gian thực thi kèm nút áp dụng 1-click.

### 🤖 4.5. Trợ Lý Giọng Nói & Chẩn Đoán AI (Gemini 3.8 Flash)
- **Điều khiển bằng giọng nói**: Hỗ trợ nhận diện giọng nói tiếng Việt qua Web Speech API để tra cứu tài nguyên máy chủ ("Kiểm tra tải CPU", "Xem cảnh báo", "Mở chứng chỉ SSL").
- **Chẩn đoán sự cố tự động**: Gọi mô hình `gemini-3.8-flash` qua Google GenAI SDK để phân tích nhật ký lỗi máy chủ và đưa ra 3 bước khắc phục ngắn gọn.

### 🔒 4.6. Bảo Mật & Xác Thực Đa Yếu Tố (Security & 2FA Tab)
- Quản lý mã QR TOTP (Google Authenticator, Microsoft Authenticator, Authy).
- Danh sách IP Whitelist bảo vệ cổng quản trị viên.
- Nhật ký kiểm toán bảo mật (Audit Trails) chi tiết thời gian, địa chỉ IP và hành động.

### 📄 4.7. Báo Cáo Chuyên Nghiệp PDF & CSV
- Xuất báo cáo tài nguyên hệ thống và tuân thủ SLA ra file **PDF chuẩn in ấn** (sử dụng `jspdf`).
- Xuất nhật ký số liệu thô ra định dạng **CSV** để phân tích bảng tính.

---

## 5. Cấu Trúc Mã Nguồn (Project Structure)

```text
├── .env.example                 # Mẫu khai báo biến môi trường (GEMINI_API_KEY, APP_URL)
├── index.html                   # Entry point HTML giao diện người dùng
├── metadata.json                # Siêu dữ liệu hệ thống, quyền và capabilities
├── package.json                 # Khai báo dependencies, build scripts (Vite, esbuild, Express)
├── server.ts                    # Backend Express server tích hợp Gemini AI và Vite middleware
├── tsconfig.json                # Cấu hình TypeScript compiler
├── vite.config.ts               # Cấu hình bundler Vite & Tailwind CSS plugin
├── src/
│   ├── main.tsx                 # Điểm khởi tạo ứng dụng React
│   ├── App.tsx                  # Component điều phối chính, thanh điều hướng & modal
│   ├── types.ts                 # Định nghĩa toàn bộ TypeScript Interfaces & Types
│   ├── mockData.ts              # Dữ liệu khởi tạo: current `velclaw.app` namespace, migration targets, nodes, metrics, SSL, alerts
│   ├── index.css                # CSS toàn cục sử dụng Tailwind CSS
│   ├── utils/
│   │   ├── pdfExport.ts         # Module tạo và xuất báo cáo hệ thống chuẩn PDF
│   │   └── csvExport.ts         # Module tạo và tải file CSV
│   └── components/
│       ├── Navbar.tsx           # Thanh điều hướng phía trên kèm trạng thái kết nối
│       ├── Sidebar.tsx          # Menu bên trái chuyển đổi giữa các phân hệ
│       ├── OverviewTab.tsx       # Bảng tổng quan hạ tầng & node clusters
│       ├── DomainManagementTab.tsx # Cấu hình `velclaw.app` và custom domains
│       ├── DnsSslTab.tsx        # Quản lý `velclaw.app`, bản ghi DNS, Anycast & SSL
│       ├── ChartsTab.tsx        # Trung tâm biểu đồ thời gian thực & heatmap
│       ├── ChartFullscreenModal.tsx # Modal phóng to biểu đồ toàn màn hình chuyên sâu
│       ├── AlertsTab.tsx        # Quản lý sự cố, ngưỡng cảnh báo & nút giả lập spike
│       ├── DbOptimizationTab.tsx # Tối ưu hóa truy vấn chậm & cơ sở dữ liệu
│       ├── LogsTab.tsx          # Nhật ký hệ thống và công cụ phân tích sự cố
│       ├── SecurityTab.tsx      # Quản lý 2FA TOTP, IP whitelist & audit log
│       ├── ApiIntegrationTab.tsx # Quản lý API Key, REST doc & Prometheus scrape config
│       ├── VoiceAssistantModal.tsx # Modal trợ lý giọng nói tiếng Việt tích hợp AI
│       ├── FcmNotificationModal.tsx # Modal quản lý thông báo đẩy Firebase Cloud Messaging
│       └── ReportsModal.tsx     # Modal cấu hình và xuất file báo cáo
```

---

## 6. Hướng Dẫn Cài Đặt & Vận Hành Chi Tiết

### 📋 Yêu Cầu Tiên Quyết (Prerequisites)
- **Node.js**: Phiên bản `>= 20.0.0`
- **npm** (hoặc **bun** / **pnpm**)
- Trình duyệt hiện đại hỗ trợ ECMAScript 2022+

---

### 🚀 Bước 1: Sao Chép Mã Nguồn & Cài Đặt Dependencies

```bash
# Di chuyển vào thư mục dự án
cd velclaw-hosting-platform

# Cài đặt các gói thư viện cần thiết
npm install
```

---

### ⚙️ Bước 2: Thiết Lập Biến Môi Trường

Tạo file `.env` từ file mẫu `.env.example`:

```bash
cp .env.example .env
```

Điền các giá trị cần thiết vào file `.env`:

```env
# API Key của Google Gemini để kích hoạt Trợ lý giọng nói & Chẩn đoán AI
GEMINI_API_KEY="AIzaSy..."

# URL của ứng dụng (trong môi trường development sử dụng localhost)
APP_URL="http://localhost:3000"
```

> **Lưu ý**: Nếu chưa có `GEMINI_API_KEY`, ứng dụng sẽ tự động chuyển sang chế độ **Local DevOps Engine Fallback** để xử lý các chỉ lệnh giọng nói và điều hướng giao diện hoàn toàn bình thường mà không gây lỗi hệ thống.

---

### 💻 Bước 3: Khởi Chạy Môi Trường Phát Triển (Development Mode)

```bash
npm run dev
```

- Dev server sẽ khởi chạy tại: **`http://localhost:3000`**
- Server chạy bằng công cụ `tsx` để xử lý trực tiếp mã TypeScript của `server.ts` và gắn kèm middleware của Vite cho giao diện client.

---

### 🔍 Bước 4: Kiểm Tra Chất Lượng Mã Nguồn (Lint & Type Check)

Trước khi đóng gói hoặc commit, kiểm tra tính toàn vẹn kiểu dữ liệu của TypeScript:

```bash
npm run lint
```

---

### 📦 Bước 5: Đóng Gói Sản Phẩm & Khởi Chạy Production

Để biên dịch ứng dụng sang mã tối ưu cho môi trường Production:

```bash
# 1. Biên dịch frontend Vite và đóng gói backend bằng esbuild
npm run build

# 2. Khởi chạy ứng dụng production từ tệp dist/server.cjs đã đóng gói
npm run start
```

File thực thi backend tự sinh tại `dist/server.cjs` ở dạng CommonJS độc lập, tối ưu hóa thời gian khởi động container và không yêu cầu phụ thuộc phức tạp lúc runtime.

---

## 7. Hướng Dẫn Cấu Hình DNS & Ingress Reverse Proxy Mẫu

### 🌐 7.1. Cấu Hình Wildcard DNS Trên Cloudflare
Cloudflare authoritative DNS cho **`velclaw.app`** phải có domain gốc và wildcard cùng trỏ về VelclawHost edge/runtime:

```text
Type     Name      Target / IPv4        Proxy status    TTL
A        @         <IP_VPS_VELCLAWHOST> Proxied (Orange) Auto
CNAME    *         @                    Proxied (Orange) Auto
```

Các domain `.com`, `.ai`, `.dev`, `.io`, `.app` chỉ được thêm sau khi migration domain chính thức được phê duyệt.

### 🛡️ 7.2. Cấu Hình Reverse Proxy Bằng Caddy (Khuyên Dùng Nhất)
Tạo file `Caddyfile` trên máy chủ Host:

```caddy
# Tự động hóa SSL Let's Encrypt cho toàn bộ cụm subdomain của Velclaw
*.velclaw.app {
    tls {
        dns cloudflare {env.CLOUDFLARE_API_TOKEN}
    }

    # Ép buộc HSTS bảo mật cao
    header {
        Strict-Transport-Security "max-age=31536000; includeSubDomains; preload"
        X-Content-Type-Options "nosniff"
        X-Frame-Options "SAMEORIGIN"
    }

    # Proxy lưu lượng tới port ứng dụng nội bộ
    reverse_proxy localhost:3000
}
```

---

### ⚙️ 7.3. Cấu Hình Bằng Nginx Ingress
Tạo file cấu hình `/etc/nginx/sites-available/velclaw.conf`:

```nginx
# Chuyển hướng toàn bộ HTTP sang HTTPS
server {
    listen 80;
    listen [::]:80;
    server_name velclaw.app *.velclaw.app;
    return 301 https://$host$request_uri;
}

# Cổng HTTPS Ingress
server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name velclaw.site *.velclaw.site velclaw.dev *.velclaw.dev velclaw.app *.velclaw.app;

    ssl_certificate /etc/letsencrypt/live/velclaw/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/velclaw/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;

    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains; preload" always;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

---

## 8. Biến Môi Trường (Environment Variables)

| Tên Biến | Bắt Buộc | Giá Trị Mặc Định | Mô Tả |
| :--- | :---: | :--- | :--- |
| `GEMINI_API_KEY` | Tùy chọn | `""` | Khóa API Google AI Studio cho mô hình Gemini 3.8 Flash |
| `APP_URL` | Tùy chọn | `http://localhost:3000` | Địa chỉ URL gốc phục vụ kiểm tra endpoint và webhook |
| `PORT` | Cố định | `3000` | Cổng ingress reverse proxy gắn kết nội bộ container |

---

## 9. Tác giả & Giấy Phép\n\n- **Nhà phát triển**: **Huỳnh Thương**.\n- **Bản quyền**: © 2026 Velclaw Cloud Architecture Team.\n\n

- **Bản quyền**: © 2026 Velclaw Cloud Architecture Team.
- **Tác giả / Quản trị viên**: Huynh Thuong (`huynhthuong.xyz@gmail.com`).
- **Mã nguồn**: Được phát triển và tối ưu hóa cho hệ sinh thái hạ tầng đám mây phân tán độ trễ thấp.


---


### Control-plane reconciliation

VelclawHost runs a bounded reconciliation loop in the server process. It verifies Docker-managed runtime containers, probes configured runtime health endpoints, and moves stale runtimes/deployments to `failed` instead of treating a persisted `running` record as proof of liveness.

Configuration:

```env
RECONCILE_INTERVAL_MS=30000
VELCLAWHOST_FAIL_ON_STATE_ERROR=true
```

The reconciliation status is available at `GET /api/v1/reconciliation` and reports run count, failures, unhealthy runtimes, and the last run timestamp.

## Control Plane API

VelclawHost exposes a minimal control-plane contract for the Velclaw core platform. The browser console and external deploy clients use the same API.

| Method | Endpoint | Purpose |
| --- | --- | --- |
| GET | `/api/v1/health` | Control-plane health; no token required |
| GET | `/api/v1/domains` | List managed domains |
| POST | `/api/v1/domains` | Register a domain target |
| POST | `/api/v1/domains/:id/verify` | Resolve DNS and verify the configured A/CNAME target |
| DELETE | `/api/v1/domains/:id` | Remove a managed domain |
| POST | `/api/v1/deployments` | Queue a deployment specification |
| GET | `/api/v1/deployments/:id` | Read deployment state |
| POST | `/api/v1/deployments/:id/execute` | Validate the remote Git ref and advance the deployment to `waiting_approval` |
| GET | `/api/v1/metrics` | Runtime and domain metrics |
| GET | `/api/v1/prometheus` | Prometheus text exposition |

When `VELCLAWHOST_API_TOKEN` is configured, protected endpoints require:

```
Authorization: Bearer <VELCLAWHOST_API_TOKEN>
```

### Domain deployment contract

Request:

```json
{
  "domain": "api.example.com",
  "recordType": "CNAME",
  "targetValue": "edge.velclaw.app",
  "notes": "production ingress"
}
```

The server accepts the current first-party namespace `velclaw.app` and custom domains. DNS verification is performed against a public DNS-over-HTTPS resolver; the service does not claim a domain is active merely because it was registered in the UI.

### Velclaw integration boundary

```
VELCLAW
   |
   | deploy spec / domain target
   v
VELCLAWHOST
   |-- domain registry
   |-- DNS verification
   |-- runtime health
   |-- metrics / Prometheus
   v
Ingress / Runtime
```

The Velclaw core repository remains the product layer. VelclawHost is the infrastructure control plane. Production DNS, TLS, proxy and runtime credentials must be injected through deployment secrets rather than committed to this repository.


### Staged deployment executor

The current executor is intentionally conservative. `POST /api/v1/deployments/:id/execute` performs a real `git ls-remote` against the requested public GitHub repository and branch, verifies an optional 40-character commit SHA, and records the observed source commit.

A successful source validation moves the deployment from `queued` to `waiting_approval`. It does **not** claim that a build, artifact upload, runtime container, health check, domain binding, or TLS issuance has completed. Those stages require the next runtime executor layer.

Deployment lifecycle:

```text
queued
  |
  | /execute
  v
building
  |
  +--> failed
  |
  v
waiting_approval
  |
  | future runtime executor
  v
ready
```

This prevents the control plane from reporting a deployment as live before an actual runtime is provisioned and health-checked.


### Runtime planning contract

After source validation, the control plane can reserve a runtime slot with:

`POST /api/v1/deployments/:id/runtime/plan`

This creates a runtime record and allocates a local port from `RUNTIME_PORT_START` (default `4100`). It is only a **resource plan**: no container or process is started, and the deployment is not marked ready.

The intended boundary is:

```text
Control Plane
  └─ runtime plan
       │
       ▼
Runtime Provider Adapter
  ├─ Docker
  ├─ Kubernetes
  └─ managed runtime
       │
       ▼
health probe → domain binding → TLS → ready
```


### Docker runtime provider

Set these server-side variables to enable the Docker adapter:

```env
RUNTIME_PROVIDER=docker
RUNTIME_IMAGE=ghcr.io/your-org/your-image:tag
RUNTIME_CONTAINER_PORT=3000
RUNTIME_PORT_START=4100
```

The provider only starts the explicitly configured `RUNTIME_IMAGE`; it never accepts an arbitrary image from the deployment request. It creates a labelled container with a restart policy and maps the planned host port to the configured container port. Docker supports creating/starting containers, published ports, labels and restart policies through its Engine interface.

The control plane then performs an HTTP health probe. Only a successful probe changes the deployment to `ready`. A container being started is therefore not treated as proof that the application is healthy.


### Runtime operations

For an enabled Docker provider, operators can inspect the latest container output and stop a runtime through the control plane:

```
GET  /api/v1/deployments/:id/runtime/logs?tail=100
POST /api/v1/deployments/:id/runtime/stop
```

The control plane keeps the deployment state separate from the container state: stopping the runtime moves the deployment out of `ready` and records an operator action instead of silently leaving stale readiness.


### Domain binding and Caddy

After DNS verification and a running runtime, bind a verified domain:

```
POST /api/v1/deployments/:id/domain/bind
{ "domainId": "dom-..." }
```

The control plane generates a Caddyfile containing one site block per active binding and proxies the hostname to the runtime's allocated loopback port. Caddy's `reverse_proxy` directive supports local upstreams and active health checks; automatic public HTTPS requires the domain to resolve to the proxy and ports 80/443 to be reachable.

By default the control plane only writes the generated configuration. Set `CADDY_AUTO_RELOAD=true` to have it invoke Caddy's reload command. This remains disabled by default so a control-plane API request cannot unexpectedly alter a production proxy.


### Persistent state backends

The control plane supports two state stores:

- `VELCLAWHOST_STATE_STORE=file` (default): atomic JSON snapshot for local development.
- `VELCLAWHOST_STATE_STORE=postgres`: PostgreSQL-backed snapshot using `DATABASE_URL` and the `db/migrations/001_control_plane_state.sql` migration.

PostgreSQL is the production-oriented option because the state is stored as `jsonb`, which PostgreSQL can index and query efficiently when needed.

Example:

```env
VELCLAWHOST_STATE_STORE=postgres
DATABASE_URL=postgresql://...
```

Run the migration before starting the service. The application does not auto-create production database schema.


### Current verification status

The control-plane branch contains the state-store abstraction and reconciliation worker. GitHub Actions has not yet reported a workflow run for the latest commit, so deployment readiness must not be inferred from source state alone.

### Deployment queue

New deployments are persisted as `queued` and picked up by the in-process deployment queue worker. The worker validates the repository branch tip and requested commit SHA, then moves the deployment to `waiting_approval`; it does not execute arbitrary build commands. Configure `DEPLOYMENT_QUEUE_INTERVAL_MS` to change the polling interval (minimum 5 seconds).

### Production deployment pipeline

The control plane now supports a durable PostgreSQL deployment queue when `VELCLAWHOST_STATE_STORE=postgres`. Queue jobs use transactional row claiming with `FOR UPDATE SKIP LOCKED`, bounded retries with exponential backoff, and active-deployment idempotency. PostgreSQL documents `SKIP LOCKED` specifically as useful for queue-like tables with multiple consumers.

Set `DEPLOYMENT_EXECUTOR=docker` to enable the build/runtime worker. It validates the GitHub branch, clones the exact commit, builds a Docker image, optionally pushes it when `IMAGE_REGISTRY` + `IMAGE_PUSH=true` are configured, starts the runtime, and performs a health check. Caddy remains responsible for public TLS; its automatic HTTPS requires correct DNS and public reachability of ports 80/443.

Production requires the PostgreSQL migrations in `db/migrations/`, persistent Docker/Caddy state, server-side secrets, and a controlled worker host. The repository does not commit credentials or assume a live production database.


## Domain provider architecture

VelclawHost is the **domain + DNS + SSL + hosting control plane** for the Velclaw ecosystem. The registrar layer is adapter-based so the UI and API are not coupled to Vercel.

First-party map:

- `velclaw.site` — Platform / Company
- `velclaw.dev` — Developer / IDE / Docs / API
- `velclaw.app` — Application / Services

Legacy `velclaw.cfd` and removed first-party `velclaw.ai` are not canonical endpoints.

### Registrar migration

Vercel exposes a Domains Registrar API for availability, pricing, auth-code retrieval, transfer-in, transfer status and nameserver management. VelclawHost includes a server-side Vercel adapter for the **source-registrar** step.

Configure:

```env
VELCLAWHOST_REGISTRAR="none"
VELCLAWHOST_SOURCE_REGISTRAR="vercel"
VERCEL_REGISTRAR_TOKEN=""
VERCEL_REGISTRAR_TEAM_ID=""
VERCEL_REGISTRAR_API_BASE_URL="https://api.vercel.com"
```

The target registrar remains a separate adapter. VelclawHost does not become an ICANN-accredited registrar merely by running this control plane; a true Velclaw registrar/reseller service requires the appropriate registrar/registry or reseller relationship.

Vercel states that outbound transfer requires a domain to have been registered with Vercel for at least 60 days before an authorization code can be requested. ICANN requires an Auth-Code for gTLD registrar transfers and applies 60-day locks in specified situations.


### Target registrar / reseller: ResellerClub

VelclawHost now supports **ResellerClub as the target registrar/reseller adapter** while Vercel remains the migration/source registrar adapter. ResellerClub's official developer platform exposes domain availability, registration, transfer and DNS lifecycle APIs, with separate sandbox and live environments.

Architecture:

```text
Velclaw
  │
  ▼
VelclawHost Control Plane
  ├── Source: Vercel
  │     └── Auth-Code / transfer-out
  │
  └── Target: ResellerClub
        ├── Availability
        ├── Transfer-in
        ├── Transfer status
        ├── Nameservers
        └── Future: registration / renewal / billing
```

Safe configuration starts in ResellerClub sandbox:

```env
VELCLAWHOST_REGISTRAR="resellerclub"
RESELLERCLUB_TEST_MODE="true"
RESELLERCLUB_USER_ID=""
RESELLERCLUB_API_KEY=""
```

Do not put live reseller credentials in Git. The provider reads them server-side only. ResellerClub's current documentation recommends sandbox testing before live provisioning.
