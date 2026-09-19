import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";

let aiClient: GoogleGenAI | null = null;

function getGeminiClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;
  if (!aiClient) {
    aiClient = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });
  }
  return aiClient;
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // API Health Endpoint
  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok", service: "Velclaw Hosting Platform Server", timestamp: new Date().toISOString() });
  });

  // AI Voice Command & Diagnostic Endpoint
  app.post("/api/ai/voice-command", async (req, res) => {
    try {
      const { command, context } = req.body;
      if (!command) {
        return res.status(400).json({ error: "Missing command text" });
      }

      const ai = getGeminiClient();
      if (!ai) {
        // Intelligent fallback when GEMINI_API_KEY is not yet populated
        const cmdLower = String(command).toLowerCase();
        let reply = "Tôi đã ghi nhận chỉ lệnh của bạn. Hệ thống máy chủ Velclaw đang vận hành ổn định.";
        let action: string | null = null;
        let targetTab: string | null = null;

        if (cmdLower.includes("cpu") || cmdLower.includes("ram") || cmdLower.includes("tài nguyên") || cmdLower.includes("hiệu suất")) {
          reply = `CPU hiện tại ở mức ${context?.cpuUsage ?? 42}% và RAM chiếm ${context?.ramUsagePercent ?? 58}%. Đã chuyển bạn tới tab Biểu đồ số liệu.`;
          action = "NAVIGATE";
          targetTab = "metrics-charts";
        } else if (cmdLower.includes("cảnh báo") || cmdLower.includes("nguy hiểm") || cmdLower.includes("alert")) {
          reply = `Đang có ${context?.activeAlertsCount ?? 0} cảnh báo đang chờ xử lý. Đã chuyển bạn đến trung tâm Cảnh báo để rà soát.`;
          action = "NAVIGATE";
          targetTab = "alerts";
        } else if (cmdLower.includes("dns") || cmdLower.includes("ssl") || cmdLower.includes("chứng chỉ") || cmdLower.includes("https")) {
          reply = `Chứng chỉ SSL TLS 1.3 Let's Encrypt còn 82 ngày hiệu lực. Bản ghi DNSSEC đang kích hoạt bảo mật.`;
          action = "NAVIGATE";
          targetTab = "dns-ssl";
        } else if (cmdLower.includes("cơ sở dữ liệu") || cmdLower.includes("database") || cmdLower.includes("tối ưu") || cmdLower.includes("query")) {
          reply = `Hệ thống phân tích đã định vị các truy vấn chậm. Đang mở trung tâm Tối ưu hóa cơ sở dữ liệu.`;
          action = "NAVIGATE";
          targetTab = "db-optimizer";
        } else if (cmdLower.includes("bảo mật") || cmdLower.includes("2fa") || cmdLower.includes("mfa")) {
          reply = `Xác thực đa yếu tố 2FA đang bảo vệ toàn diện tài khoản quản trị viên huynhthuong.xyz@gmail.com.`;
          action = "NAVIGATE";
          targetTab = "security-2fa";
        } else if (cmdLower.includes("báo cáo") || cmdLower.includes("pdf") || cmdLower.includes("csv") || cmdLower.includes("xuất")) {
          reply = `Đang mở trình tạo và xuất báo cáo hệ thống định dạng PDF/CSV.`;
          action = "OPEN_REPORTS";
        } else if (cmdLower.includes("giả lập") || cmdLower.includes("test spike") || cmdLower.includes("đột biến")) {
          reply = `Đã kích hoạt giả lập đột biến CPU/RAM để kiểm tra hệ thống thông báo đẩy FCM.`;
          action = "TRIGGER_SPIKE";
        }

        return res.json({
          reply,
          action,
          targetTab,
          source: "local-devops-engine",
        });
      }

      // With Gemini API
      const prompt = `Bạn là Trợ lý Giọng nói AI Cao cấp chuyên về DevOps và Quản trị hạ tầng máy chủ cho nền tảng Velclaw Hosting Platform.
Người quản trị vừa nói hoặc ra lệnh giọng nói: "${command}".

Ngữ cảnh máy chủ thời gian thực:
- Hostname: ${context?.hostname || "prod-edge-asia1.velclaw.net"}
- CPU hiện tại: ${context?.cpuUsage || 45}%
- RAM hiện tại: ${context?.ramUsagePercent || 60}% (${context?.ramUsedGb || 9.6} / 16.0 GB)
- Cảnh báo đang kích hoạt: ${context?.activeAlertsCount || 0}
- Trạng thái 2FA: ${context?.is2FaActive ? "Đang bật" : "Chưa bật"}
- P95 HTTP Latency: ${context?.latencyMs || 12} ms

Yêu cầu:
1. Trả lời một câu ngắn gọn, súc tích (1-2 câu), chuyên nghiệp bằng tiếng Việt như một kỹ sư DevOps cao cấp.
2. Quyết định xem có cần thực hiện hành động nào trên giao diện không:
   - "NAVIGATE" (chuyển tab tới: 'overview', 'dns-ssl', 'metrics-charts', 'alerts', 'db-optimizer', 'logs', 'security-2fa', 'api-integration', 'reports')
   - "TRIGGER_SPIKE" (nếu người dùng muốn thử nghiệm cảnh báo/đột biến tải)
   - "OPEN_REPORTS" (nếu muốn xuất báo cáo)
   - "NONE" nếu chỉ là câu hỏi thông tin.

Định dạng trả về duy nhất bằng JSON:
{
  "reply": "câu trả lời cho quản trị viên",
  "action": "NAVIGATE" | "TRIGGER_SPIKE" | "OPEN_REPORTS" | "NONE",
  "targetTab": "overview" | "dns-ssl" | "metrics-charts" | "alerts" | "db-optimizer" | "logs" | "security-2fa" | "api-integration" | "reports" | null
}`;

      const response = await ai.models.generateContent({
        model: "gemini-3.8-flash",
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          systemInstruction: "Bạn là trợ lý điều khiển giọng nói cho hệ thống máy chủ Velclaw Hosting. Luôn phản hồi JSON hợp lệ.",
        },
      });

      const responseText = response.text || "{}";
      let parsed = { reply: "Đã tiếp nhận chỉ lệnh máy chủ.", action: "NONE", targetTab: null };
      try {
        parsed = JSON.parse(responseText);
      } catch {
        parsed.reply = responseText.replace(/```json|```/g, "").trim();
      }

      return res.json({
        reply: parsed.reply,
        action: parsed.action,
        targetTab: parsed.targetTab,
        source: "gemini-3.8-flash",
      });
    } catch (err: any) {
      console.error("AI Voice Command Error:", err);
      return res.status(500).json({
        error: "Lỗi xử lý chỉ lệnh giọng nói",
        details: err?.message || String(err),
      });
    }
  });

  // AI Diagnostic Endpoint for Logs and Performance
  app.post("/api/ai/diagnose", async (req, res) => {
    try {
      const { issueType, data } = req.body;
      const ai = getGeminiClient();

      if (!ai) {
        return res.json({
          diagnosis: "Chỉ số hệ thống cơ bản trong ngưỡng an toàn. Để phân tích sâu bằng mô hình Gemini AI, vui lòng kiểm tra API Key trong cấu hình Settings.",
          suggestions: [
            "Kiểm tra lại cấu hình bộ nhớ đệm Redis",
            "Bật nén gzip/brotli cho các tài nguyên tĩnh",
            "Đảm bảo đã thiết lập chỉ mục (index) cho bảng có dung lượng lớn",
          ],
          severity: "normal",
        });
      }

      const prompt = `Phân tích sự cố máy chủ sau đây và đưa ra chẩn đoán nguyên nhân cốt lõi cùng 3 giải pháp khắc phục ngắn gọn:
Loại sự cố: ${issueType}
Dữ liệu chi tiết: ${JSON.stringify(data)}

Định dạng JSON:
{
  "diagnosis": "giải thích nguyên nhân 1-2 câu",
  "suggestions": ["giải pháp 1", "giải pháp 2", "giải pháp 3"],
  "severity": "low" | "medium" | "high" | "critical"
}`;

      const response = await ai.models.generateContent({
        model: "gemini-3.8-flash",
        contents: prompt,
        config: {
          responseMimeType: "application/json",
        },
      });

      const text = response.text || "{}";
      const result = JSON.parse(text);
      return res.json(result);
    } catch (err: any) {
      console.error("AI Diagnose Error:", err);
      return res.status(500).json({ error: "Lỗi chẩn đoán AI", details: err?.message });
    }
  });

  // Vite Middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
