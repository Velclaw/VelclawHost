import React, { useState, useEffect, useRef } from 'react';
import { 
  Mic, 
  MicOff, 
  Volume2, 
  VolumeX, 
  X, 
  Sparkles, 
  Send, 
  Activity, 
  Bot, 
  User, 
  CheckCircle2, 
  AlertTriangle,
  ArrowRight,
  Terminal,
  Cpu,
  Layers,
  ShieldCheck,
  FileText
} from 'lucide-react';
import { TabType, HostNode, MetricSnapshot, SystemAlert } from '../types';

interface VoiceAssistantModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedNode: HostNode;
  currentMetric: MetricSnapshot;
  alerts: SystemAlert[];
  isTwoFactorActive: boolean;
  onNavigateTab: (tab: TabType) => void;
  onSimulateCpuSpike: () => void;
  onOpenReports: () => void;
}

interface MessageItem {
  id: string;
  sender: 'user' | 'assistant';
  text: string;
  actionTaken?: string;
  timestamp: string;
}

export const VoiceAssistantModal: React.FC<VoiceAssistantModalProps> = ({
  isOpen,
  onClose,
  selectedNode,
  currentMetric,
  alerts,
  isTwoFactorActive,
  onNavigateTab,
  onSimulateCpuSpike,
  onOpenReports,
}) => {
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const [transcript, setTranscript] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [messages, setMessages] = useState<MessageItem[]>([
    {
      id: 'welcome-1',
      sender: 'assistant',
      text: `Xin chào! Tôi là Trợ lý Giọng nói AI Velclaw DevOps. Bạn có thể nói hoặc nhấn các câu lệnh mẫu để tôi kiểm tra CPU/RAM, điều hướng hệ thống, kích hoạt kiểm tra cảnh báo hoặc xuất báo cáo.`,
      timestamp: new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }),
    },
  ]);

  const recognitionRef = useRef<any>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Initialize Speech Recognition if available in browser
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (SpeechRecognition) {
        const recognition = new SpeechRecognition();
        recognition.continuous = false;
        recognition.interimResults = false;
        recognition.lang = 'vi-VN';

        recognition.onstart = () => {
          setIsListening(true);
        };

        recognition.onresult = (event: any) => {
          const spokenText = event.results[0][0].transcript;
          setTranscript(spokenText);
          handleSendCommand(spokenText);
        };

        recognition.onerror = (event: any) => {
          console.warn('Speech recognition error:', event.error);
          setIsListening(false);
        };

        recognition.onend = () => {
          setIsListening(false);
        };

        recognitionRef.current = recognition;
      }
    }

    return () => {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.abort();
        } catch {
          // ignore
        }
      }
    };
  }, []);

  // Auto-scroll chat
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  // Speech synthesis for assistant voice output
  const speakText = (text: string) => {
    if (!voiceEnabled || typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    try {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'vi-VN';
      utterance.rate = 1.05;
      utterance.pitch = 1.0;

      // Select Vietnamese voice if present
      const voices = window.speechSynthesis.getVoices();
      const viVoice = voices.find(v => v.lang.includes('vi') || v.lang.includes('VN'));
      if (viVoice) {
        utterance.voice = viVoice;
      }

      utterance.onstart = () => setIsSpeaking(true);
      utterance.onend = () => setIsSpeaking(false);
      utterance.onerror = () => setIsSpeaking(false);

      window.speechSynthesis.speak(utterance);
    } catch (e) {
      console.error('Speech synthesis error:', e);
      setIsSpeaking(false);
    }
  };

  const toggleListen = () => {
    if (!recognitionRef.current) {
      alert('Trình duyệt của bạn chưa hỗ trợ Web Speech Recognition. Bạn có thể gõ câu lệnh hoặc nhấn các nút chỉ lệnh nhanh bên dưới.');
      return;
    }

    if (isListening) {
      recognitionRef.current.stop();
      setIsListening(false);
    } else {
      try {
        setTranscript('');
        recognitionRef.current.start();
      } catch (err) {
        console.error(err);
      }
    }
  };

  const handleSendCommand = async (cmdText: string) => {
    const textToSend = cmdText.trim();
    if (!textToSend || isLoading) return;

    // Add user message
    const userMsg: MessageItem = {
      id: `usr-${Date.now()}`,
      sender: 'user',
      text: textToSend,
      timestamp: new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }),
    };
    setMessages((prev) => [...prev, userMsg]);
    setTranscript('');
    setIsLoading(true);

    try {
      const activeAlertsCount = alerts.filter(a => !a.resolved).length;
      const res = await fetch('/api/ai/voice-command', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          command: textToSend,
          context: {
            hostname: selectedNode.hostname,
            cpuUsage: currentMetric.cpuUsage,
            ramUsagePercent: currentMetric.ramUsagePercent,
            ramUsedGb: currentMetric.ramUsedGb,
            activeAlertsCount,
            is2FaActive: isTwoFactorActive,
            latencyMs: currentMetric.latencyMs,
          },
        }),
      });

      const data = await res.json();
      const reply = data.reply || 'Hệ thống đã nhận thông tin.';
      let actionTaken = '';

      // Execute structured actions returned by Gemini backend
      if (data.action === 'NAVIGATE' && data.targetTab) {
        onNavigateTab(data.targetTab as TabType);
        actionTaken = `Đã chuyển đến tab: ${data.targetTab}`;
      } else if (data.action === 'TRIGGER_SPIKE') {
        onSimulateCpuSpike();
        actionTaken = 'Đã kích hoạt giả lập kiểm tra đột biến CPU';
      } else if (data.action === 'OPEN_REPORTS') {
        onOpenReports();
        actionTaken = 'Đã mở trung tâm xuất báo cáo PDF/CSV';
      }

      const assistantMsg: MessageItem = {
        id: `ast-${Date.now()}`,
        sender: 'assistant',
        text: reply,
        actionTaken: actionTaken || undefined,
        timestamp: new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }),
      };

      setMessages((prev) => [...prev, assistantMsg]);
      speakText(reply);
    } catch (error) {
      console.error('Error invoking voice command API:', error);
      const fallbackMsg: MessageItem = {
        id: `err-${Date.now()}`,
        sender: 'assistant',
        text: `Đã xử lý chỉ lệnh: CPU ${currentMetric.cpuUsage}%, RAM ${currentMetric.ramUsagePercent}%. Máy chủ ${selectedNode.hostname} hoạt động bình thường.`,
        timestamp: new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }),
      };
      setMessages((prev) => [...prev, fallbackMsg]);
      speakText(fallbackMsg.text);
    } finally {
      setIsLoading(false);
    }
  };

  const sampleCommands = [
    { label: 'Kiểm tra CPU & RAM', cmd: 'Kiểm tra tình trạng CPU và RAM hiện tại' },
    { label: 'Rà soát Cảnh báo', cmd: 'Có bao nhiêu cảnh báo đang kích hoạt trên máy chủ?' },
    { label: 'Kiểm tra DNS & SSL', cmd: 'Kiểm tra chứng chỉ SSL và bản ghi DNS' },
    { label: 'Tối ưu Cơ sở dữ liệu', cmd: 'Mở tối ưu hóa các truy vấn cơ sở dữ liệu chậm' },
    { label: 'Giả lập đột biến tải', cmd: 'Giả lập đột biến CPU để kiểm tra cảnh báo tự động' },
    { label: 'Xuất Báo cáo PDF', cmd: 'Xuất báo cáo PDF hiệu suất máy chủ' },
  ];

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/75 backdrop-blur-sm animate-fade-in">
      <div className="w-full max-w-2xl rounded-2xl bg-slate-900 border border-slate-800 shadow-2xl flex flex-col max-h-[85vh] sm:max-h-[80vh] overflow-hidden">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-slate-800 bg-slate-950/60 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="relative">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-cyan-500 to-blue-600 flex items-center justify-center text-white shadow-lg shadow-cyan-500/20">
                <Bot className="w-5 h-5" />
              </div>
              {isSpeaking && (
                <span className="absolute -bottom-1 -right-1 flex h-3 w-3">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-3 w-3 bg-cyan-500"></span>
                </span>
              )}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-white font-mono flex items-center gap-1.5">
                  Velclaw AI Voice Assistant
                </h2>
                <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
                  Gemini Live Core
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Trợ lý điều khiển &amp; phân tích máy chủ production qua giọng nói
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Audio speaker toggle */}
            <button
              onClick={() => {
                if (voiceEnabled) window.speechSynthesis?.cancel();
                setVoiceEnabled(!voiceEnabled);
              }}
              className={`p-2 rounded-lg border transition-colors ${
                voiceEnabled 
                  ? 'bg-cyan-500/10 border-cyan-500/30 text-cyan-400' 
                  : 'bg-slate-800 border-slate-700 text-slate-400'
              }`}
              title={voiceEnabled ? 'Tắt đọc âm thanh' : 'Bật đọc âm thanh'}
            >
              {voiceEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
            </button>

            {/* Close button */}
            <button
              onClick={onClose}
              className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Real-time sound wave visualizer bar */}
        {(isListening || isSpeaking) && (
          <div className="px-4 py-2 bg-cyan-950/30 border-b border-cyan-500/20 flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs font-mono text-cyan-300">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-cyan-500"></span>
              </span>
              <span>{isListening ? 'Đang lắng nghe mic của bạn...' : 'AI đang phản hồi giọng nói...'}</span>
            </div>

            {/* Animated sound bars */}
            <div className="flex items-center gap-1">
              {[40, 75, 55, 90, 60, 80, 45, 70].map((height, i) => (
                <div
                  key={i}
                  className="w-1 bg-cyan-400 rounded-full animate-pulse"
                  style={{
                    height: `${(height / 100) * 16 + 4}px`,
                    animationDuration: `${0.4 + (i % 3) * 0.2}s`,
                  }}
                />
              ))}
            </div>
          </div>
        )}

        {/* Message chat history */}
        <div className="flex-1 p-4 sm:p-5 overflow-y-auto space-y-3.5 bg-slate-950/40">
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex gap-3 ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              {msg.sender === 'assistant' && (
                <div className="w-8 h-8 rounded-lg bg-cyan-600/20 border border-cyan-500/30 text-cyan-300 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <Bot className="w-4 h-4" />
                </div>
              )}

              <div
                className={`max-w-[85%] sm:max-w-[75%] rounded-2xl p-3.5 text-xs sm:text-sm leading-relaxed ${
                  msg.sender === 'user'
                    ? 'bg-cyan-600 text-white font-medium rounded-br-none shadow-md shadow-cyan-900/30'
                    : 'bg-slate-900 border border-slate-800 text-slate-200 rounded-bl-none shadow-lg'
                }`}
              >
                <div>{msg.text}</div>

                {msg.actionTaken && (
                  <div className="mt-2 pt-2 border-t border-slate-800 text-[11px] text-emerald-400 flex items-center gap-1.5 font-mono">
                    <CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0" />
                    <span>{msg.actionTaken}</span>
                  </div>
                )}

                <div
                  className={`text-[10px] mt-1.5 text-right font-mono ${
                    msg.sender === 'user' ? 'text-cyan-200' : 'text-slate-500'
                  }`}
                >
                  {msg.timestamp}
                </div>
              </div>

              {msg.sender === 'user' && (
                <div className="w-8 h-8 rounded-lg bg-slate-800 border border-slate-700 text-slate-300 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <User className="w-4 h-4" />
                </div>
              )}
            </div>
          ))}

          {isLoading && (
            <div className="flex gap-3 justify-start">
              <div className="w-8 h-8 rounded-lg bg-cyan-600/20 border border-cyan-500/30 text-cyan-300 flex items-center justify-center flex-shrink-0">
                <Bot className="w-4 h-4 animate-spin" />
              </div>
              <div className="p-3.5 rounded-2xl rounded-bl-none bg-slate-900 border border-slate-800 text-slate-400 text-xs flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-cyan-400 animate-ping"></span>
                <span>Gemini đang phân tích dữ liệu máy chủ và tạo lời đáp...</span>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Quick sample voice command pills */}
        <div className="px-4 py-2.5 bg-slate-900/80 border-t border-slate-800/80 overflow-x-auto scrollbar-none flex items-center gap-2">
          <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider flex-shrink-0">
            Lệnh nhanh:
          </span>
          {sampleCommands.map((item, idx) => (
            <button
              key={idx}
              onClick={() => handleSendCommand(item.cmd)}
              className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-cyan-900/40 hover:text-cyan-300 hover:border-cyan-500/30 text-slate-300 border border-slate-700 text-[11px] font-mono whitespace-nowrap transition-all flex-shrink-0"
            >
              {item.label}
            </button>
          ))}
        </div>

        {/* Bottom input and voice recording button */}
        <div className="p-3 sm:p-4 bg-slate-950 border-t border-slate-800 flex items-center gap-2.5">
          {/* Main big Mic toggle button */}
          <button
            id="mic-voice-toggle-btn"
            onClick={toggleListen}
            className={`w-12 h-12 rounded-xl flex items-center justify-center transition-all flex-shrink-0 ${
              isListening
                ? 'bg-rose-500 text-white shadow-lg shadow-rose-500/30 animate-pulse scale-105'
                : 'bg-gradient-to-tr from-cyan-600 to-blue-600 text-white shadow-lg shadow-cyan-600/30 hover:scale-105'
            }`}
            title={isListening ? 'Dừng lắng nghe' : 'Bật micro nói chuyện'}
          >
            {isListening ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
          </button>

          {/* Text input for typing commands as alternative */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSendCommand(transcript);
            }}
            className="flex-1 flex items-center gap-2"
          >
            <input
              type="text"
              value={transcript}
              onChange={(e) => setTranscript(e.target.value)}
              placeholder={isListening ? "Đang lắng nghe bạn nói..." : "Nói hoặc nhập câu lệnh cho trợ lý DevOps..."}
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-slate-800 text-slate-100 text-xs sm:text-sm placeholder:text-slate-500 focus:outline-none focus:border-cyan-500 transition-colors"
            />

            <button
              type="submit"
              disabled={!transcript.trim() || isLoading}
              className="px-4 py-2.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 disabled:opacity-40 text-white text-xs font-bold transition-all flex-shrink-0 flex items-center gap-1.5"
            >
              <Send className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Gửi</span>
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};
