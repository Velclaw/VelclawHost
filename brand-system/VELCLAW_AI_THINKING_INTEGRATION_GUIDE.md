# VELCLAW AI Thinking — Integration Guide

Hướng dẫn tích hợp hiệu ứng **AI Thinking** của VELCLAW vào ứng dụng React hoặc Next.js.

Hiệu ứng được thiết kế cho trạng thái trợ lý đang chuẩn bị hoặc streaming câu trả lời. Nó dùng ba tín hiệu nhận diện chính:

- **Breathing halo:** vòng halo xanh co giãn nhẹ để biểu thị hệ thống đang hoạt động.
- **VELCLAW mark:** dấu V + móng vuốt ở tâm, chuyển động rất nhẹ để giữ nhận diện thương hiệu.
- **Signal dots:** ba chấm xanh chạy tuần tự thay cho spinner nặng tính kỹ thuật.

Mục tiêu là cho người dùng biết hệ thống đang làm việc mà không tạo cảm giác chờ đợi căng thẳng hoặc gây nhiễu giao diện.

---

## 1. Trạng thái và hành vi

Component nên có ba trạng thái bên ngoài:

| Trạng thái | `status` | Nội dung gợi ý | Hành vi |
|---|---|---|---|
| Đang suy nghĩ | `thinking` | `VELCLAW is thinking` | Halo, mark và dots chạy liên tục |
| Đang trả lời | `streaming` | `VELCLAW is responding` | Giữ tín hiệu nhẹ, có thể giảm tốc độ dots |
| Đã sẵn sàng | `ready` | `Answer ready` | Dừng animation, hiển thị tín hiệu hoàn tất |

Không nên hiển thị AI Thinking sau khi nội dung trả lời đầu tiên đã xuất hiện, trừ khi ứng dụng vẫn đang stream các phần tiếp theo.

---

## 2. Component React/TypeScript

Tạo file `components/velclaw/AiThinkingIndicator.tsx`:

```tsx
import "./AiThinkingIndicator.css";

type ThinkingStatus = "thinking" | "streaming" | "ready";

type AiThinkingIndicatorProps = {
  status?: ThinkingStatus;
  label?: string;
  showLabel?: boolean;
  className?: string;
};

const defaultLabels: Record<ThinkingStatus, string> = {
  thinking: "VELCLAW is thinking",
  streaming: "VELCLAW is responding",
  ready: "Answer ready",
};

export function AiThinkingIndicator({
  status = "thinking",
  label,
  showLabel = true,
  className = "",
}: AiThinkingIndicatorProps) {
  const isActive = status !== "ready";
  const accessibleLabel = label ?? defaultLabels[status];

  return (
    <div
      className={`vc-thinking vc-thinking--${status} ${className}`.trim()}
      data-status={status}
      role="status"
      aria-live="polite"
      aria-label={accessibleLabel}
    >
      <div className="vc-thinking__visual" aria-hidden="true">
        <span className="vc-thinking__halo" />
        <span className="vc-thinking__core">
          {/* Thay phần này bằng SVG logo chính thức nếu ứng dụng đã có asset SVG. */}
          <span className="vc-thinking__mark">
            <i />
            <b />
            <em />
          </span>
        </span>
        <span className="vc-thinking__dots">
          <i />
          <i />
          <i />
        </span>
      </div>

      {showLabel && (
        <span className="vc-thinking__label">
          {accessibleLabel}
          {isActive && <span className="vc-thinking__caret">_</span>}
        </span>
      )}
    </div>
  );
}
```

Dùng `role="status"` và `aria-live="polite"` để screen reader nhận biết trạng thái mà không cắt ngang nội dung người dùng đang đọc.

---

## 3. CSS animation

Tạo file `components/velclaw/AiThinkingIndicator.css`:

```css
:root {
  --vc-carbon: #0b0c0f;
  --vc-cloud: #f7f8fa;
  --vc-silver: #c7cbd4;
  --vc-blue: #2f80ff;
  --vc-muted: #8e939e;
  --vc-ease: cubic-bezier(.2, .8, .2, 1);
}

.vc-thinking {
  display: inline-flex;
  align-items: center;
  gap: 12px;
  color: var(--vc-cloud);
  font: 500 12px/1.2 Inter, ui-sans-serif, system-ui, sans-serif;
}

.vc-thinking__visual {
  width: 64px;
  height: 64px;
  position: relative;
  display: grid;
  place-items: center;
}

.vc-thinking__halo {
  position: absolute;
  inset: 4px;
  border: 1px solid rgba(47, 128, 255, .58);
  border-radius: 50%;
  box-shadow:
    0 0 0 9px rgba(47, 128, 255, .06),
    0 0 32px rgba(47, 128, 255, .16);
  animation: vc-thinking-breathe 1.8s var(--vc-ease) infinite;
}

.vc-thinking__core {
  width: 40px;
  height: 40px;
  border: 1px solid rgba(255, 255, 255, .14);
  border-radius: 50%;
  display: grid;
  place-items: center;
  animation: vc-thinking-rotate 5s linear infinite;
}

/* CSS fallback mark: V + claw. Prefer the official SVG mark in production. */
.vc-thinking__mark {
  width: 22px;
  height: 22px;
  position: relative;
  display: block;
  color: var(--vc-cloud);
}

.vc-thinking__mark i,
.vc-thinking__mark b,
.vc-thinking__mark em {
  position: absolute;
  display: block;
  background: currentColor;
  transform-origin: bottom left;
}

.vc-thinking__mark i {
  width: 6px;
  height: 22px;
  left: 3px;
  bottom: 0;
  transform: skew(27deg) rotate(12deg);
}

.vc-thinking__mark b {
  width: 6px;
  height: 15px;
  left: 12px;
  bottom: 3px;
  transform: skew(-41deg) rotate(47deg);
  opacity: .75;
}

.vc-thinking__mark em {
  width: 4px;
  height: 10px;
  left: 15px;
  bottom: 5px;
  transform: skew(-46deg) rotate(48deg);
  background: var(--vc-blue);
}

.vc-thinking__dots {
  position: absolute;
  right: -7px;
  bottom: 0;
  display: flex;
  gap: 4px;
}

.vc-thinking__dots i {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: var(--vc-blue);
  animation: vc-thinking-dot 1.25s var(--vc-ease) infinite;
}

.vc-thinking__dots i:nth-child(2) { animation-delay: .16s; }
.vc-thinking__dots i:nth-child(3) { animation-delay: .32s; }

.vc-thinking__caret {
  color: var(--vc-blue);
  margin-left: 2px;
  animation: vc-thinking-blink 1s steps(2, end) infinite;
}

.vc-thinking--streaming .vc-thinking__dots i {
  animation-duration: 1.6s;
}

.vc-thinking--ready .vc-thinking__halo,
.vc-thinking--ready .vc-thinking__core,
.vc-thinking--ready .vc-thinking__dots i,
.vc-thinking--ready .vc-thinking__caret {
  animation-play-state: paused;
}

.vc-thinking--ready .vc-thinking__halo {
  opacity: .45;
  transform: scale(.92);
}

.vc-thinking--ready .vc-thinking__dots i {
  opacity: .6;
}

@keyframes vc-thinking-breathe {
  0%, 100% { opacity: .7; transform: scale(.88); }
  50% { opacity: 1; transform: scale(1.12); }
}

@keyframes vc-thinking-rotate {
  to { transform: rotate(360deg); }
}

@keyframes vc-thinking-dot {
  0%, 60%, 100% { opacity: .35; transform: translateY(0); }
  30% { opacity: 1; transform: translateY(-5px); }
}

@keyframes vc-thinking-blink {
  50% { opacity: 0; }
}

@media (prefers-reduced-motion: reduce) {
  .vc-thinking__halo,
  .vc-thinking__core,
  .vc-thinking__dots i,
  .vc-thinking__caret {
    animation: none;
  }

  .vc-thinking__halo {
    opacity: .8;
  }
}
```

### Light mode

Trong Light mode, giữ nền `#F7F8FA`, đổi màu chữ chính thành `#141518`, và dùng cùng `--vc-blue: #2F80FF`. Nếu halo quá nhạt trên nền sáng, tăng border lên `rgba(47, 128, 255, .72)` nhưng không tăng glow quá mạnh.

```css
[data-theme="light"] .vc-thinking {
  color: #141518;
}

[data-theme="light"] .vc-thinking__core {
  border-color: rgba(20, 21, 24, .14);
}

[data-theme="light"] .vc-thinking__mark {
  color: #141518;
}
```

---

## 4. Dùng trong Next.js App Router

Vì component có animation CSS và không dùng state nội bộ bắt buộc, có thể import trực tiếp trong Server Component. Nếu cần nút chuyển trạng thái hoặc đọc dữ liệu stream ở client, đặt phần điều khiển trong file có `"use client"`.

```tsx
import { AiThinkingIndicator } from "@/components/velclaw/AiThinkingIndicator";

export default function AssistantStatus() {
  return <AiThinkingIndicator status="thinking" />;
}
```

Ví dụ trong chat panel:

```tsx
"use client";

import { useState } from "react";
import { AiThinkingIndicator } from "@/components/velclaw/AiThinkingIndicator";

type Status = "idle" | "thinking" | "streaming" | "ready" | "error";

export function ChatPanel() {
  const [status, setStatus] = useState<Status>("idle");
  const [answer, setAnswer] = useState("");

  async function sendMessage(prompt: string) {
    setAnswer("");
    setStatus("thinking");

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt }),
      });

      if (!response.ok || !response.body) {
        throw new Error("Chat request failed");
      }

      setStatus("streaming");
      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        setAnswer((current) => current + decoder.decode(value, { stream: true }));
      }

      setStatus("ready");
    } catch {
      setStatus("error");
    }
  }

  const indicatorStatus =
    status === "thinking" || status === "streaming" ? status : "ready";

  return (
    <section aria-label="VELCLAW assistant">
      {answer ? <p>{answer}</p> : null}

      {(status === "thinking" || status === "streaming" || status === "ready") && (
        <AiThinkingIndicator
          status={indicatorStatus}
          label={status === "ready" ? "Answer ready" : undefined}
        />
      )}

      {status === "error" && (
        <p role="alert">Không thể nhận câu trả lời. Vui lòng thử lại.</p>
      )}

      <button onClick={() => sendMessage("Help me find the clearest next move.")}>
        Send
      </button>
    </section>
  );
}
```

### Khuyến nghị cho streaming

1. Đặt `thinking` ngay khi người dùng submit prompt.
2. Chuyển sang `streaming` ngay khi nhận được chunk đầu tiên.
3. Giữ indicator cạnh vùng trả lời trong suốt thời gian stream.
4. Chuyển sang `ready` sau khi stream kết thúc.
5. Chuyển sang trạng thái lỗi riêng, không dùng `ready` để che giấu lỗi.

Nếu UI muốn ẩn indicator ngay khi chunk đầu tiên xuất hiện, hãy giữ component trong một vùng chuyển tiếp ngắn khoảng 150–250ms để tránh layout nhảy.

---

## 5. Dùng với route handler Next.js

Ví dụ tối giản cho `app/api/chat/route.ts` trả response dạng stream:

```ts
export async function POST(request: Request) {
  const { prompt } = await request.json();

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const chunks = [`Thinking about: ${prompt}`, "\n", "Here is the clearest next move."];

      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
        await new Promise((resolve) => setTimeout(resolve, 180));
      }

      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-cache",
    },
  });
}
```

Đây chỉ là mock streaming để kiểm tra UI. Khi tích hợp model thật, thay phần `chunks` bằng stream từ backend hoặc AI SDK mà ứng dụng đang sử dụng.

---

## 6. Kích thước khuyến nghị

| Ngữ cảnh | Kích thước visual | Label |
|---|---:|---|
| Chat bubble | 40–48px | 11–12px |
| Chat panel | 56–64px | 12–14px |
| Full-screen loading | 72–96px | 14–16px |
| Mobile compact | 40px | Có thể ẩn label |

Khi ẩn label trên mobile, vẫn giữ `aria-label` trên wrapper để trạng thái không bị mất với người dùng screen reader.

---

## 7. Accessibility và hiệu năng

- Luôn dùng `role="status"` và `aria-live="polite"`.
- Không dùng animation để truyền tải thông tin duy nhất; label phải nói rõ trạng thái.
- Tôn trọng `prefers-reduced-motion: reduce`.
- Không chạy request animation bằng JavaScript; CSS animation nhẹ hơn và không tạo timer React liên tục.
- Không mount nhiều indicator cùng lúc trong một chat thread.
- Dừng hoặc unmount indicator khi request bị hủy bằng `AbortController`.
- Giữ label ngắn, tránh cập nhật nội dung live quá thường xuyên.

Ví dụ hủy request khi người dùng rời trang:

```tsx
const controller = new AbortController();

fetch("/api/chat", {
  method: "POST",
  signal: controller.signal,
  body: JSON.stringify({ prompt }),
});

// Khi cần hủy:
controller.abort();
```

---

## 8. Design tokens VELCLAW

```css
:root {
  --vc-carbon: #0B0C0F;
  --vc-ink: #141518;
  --vc-cloud: #F7F8FA;
  --vc-silver: #C7CBD4;
  --vc-blue: #2F80FF;
}
```

- `Carbon`: nền Dark mode và vùng chat chính.
- `Cloud`: chữ sáng, nền Light mode.
- `Silver`: lớp phụ và trạng thái không active.
- `Signal blue`: halo, dots, caret và các tín hiệu hành động.

Không thêm gradient, shadow nặng hoặc hiệu ứng 3D vào indicator. Hiệu ứng cần giống một tín hiệu hệ thống chính xác, không phải một màn hình loading trang trí.

---

## 9. Checklist nghiệm thu

- [ ] Indicator xuất hiện ngay sau thao tác submit.
- [ ] Label thay đổi đúng giữa `thinking`, `streaming`, `ready`.
- [ ] Halo và dots chạy mượt ở desktop và mobile.
- [ ] Light mode vẫn đủ tương phản.
- [ ] `prefers-reduced-motion` tắt chuyển động.
- [ ] Screen reader đọc được trạng thái hiện tại.
- [ ] Request lỗi hiển thị thông báo lỗi riêng.
- [ ] Không có layout shift lớn khi indicator xuất hiện hoặc biến mất.
- [ ] Component không phụ thuộc vào thư viện animation bên ngoài.
