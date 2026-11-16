import React, { useState, useEffect, useRef } from 'react';
import {
  Paperclip, Volume2, VolumeX, X, Send, Activity, Bot, User,
  CheckCircle2, Terminal, Cpu, ShieldCheck, FileText, Sparkles,
  Command, ArrowUpRight, AudioLines
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

const clock = () => new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });

export const VoiceAssistantModal: React.FC<VoiceAssistantModalProps> = ({
  isOpen, onClose, selectedNode, currentMetric, alerts, isTwoFactorActive,
  onNavigateTab, onSimulateCpuSpike, onOpenReports,
}) => {
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const [transcript, setTranscript] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [messages, setMessages] = useState<MessageItem[]>([{
    id: 'welcome-1', sender: 'assistant',
    text: 'I’m VelClaw AI. I can help inspect infrastructure, investigate incidents, review deployments and navigate your DevOps workspace. What would you like to work on?',
    timestamp: clock(),
  }]);
  const recognitionRef = useRef<any>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const submittingRef = useRef(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) return;
    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = 'vi-VN';
    recognition.onstart = () => setIsListening(true);
    recognition.onresult = (event: any) => {
      const spokenText = event.results?.[0]?.[0]?.transcript || '';
      setTranscript(spokenText);
      void handleSendCommand(spokenText);
    };
    recognition.onerror = () => setIsListening(false);
    recognition.onend = () => setIsListening(false);
    recognitionRef.current = recognition;
    return () => { try { recognition.abort(); } catch { /* no-op */ } };
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, isLoading]);

  useEffect(() => {
    if (isOpen) window.setTimeout(() => inputRef.current?.focus(), 80);
    else {
      recognitionRef.current?.abort?.();
      window.speechSynthesis?.cancel();
      setIsListening(false);
      setIsSpeaking(false);
    }
  }, [isOpen]);

  const speakText = (text: string) => {
    if (!voiceEnabled || typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'vi-VN';
    utterance.rate = 1.04;
    const voice = window.speechSynthesis.getVoices().find(v => /vi|VN/i.test(v.lang));
    if (voice) utterance.voice = voice;
    utterance.onstart = () => setIsSpeaking(true);
    utterance.onend = () => setIsSpeaking(false);
    utterance.onerror = () => setIsSpeaking(false);
    window.speechSynthesis.speak(utterance);
  };

  const handleSendCommand = async (cmdText: string) => {
    const command = cmdText.trim();
    const file = selectedFile;
    if ((!command && !file) || submittingRef.current) return;
    submittingRef.current = true;
    setIsLoading(true);
    try {
      let attachment: { name: string; mimeType: string; data: string } | undefined;
      if (file) {
        const data = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result).split(',')[1] || '');
          reader.onerror = () => reject(new Error('Unable to read file'));
          reader.readAsDataURL(file);
        });
        const mime: Record<string,string> = { pdf:'application/pdf', png:'image/png', jpg:'image/jpeg', jpeg:'image/jpeg', webp:'image/webp', txt:'text/plain', md:'text/markdown', csv:'text/csv', json:'application/json' };
        attachment = { name:file.name, mimeType:mime[file.name.split('.').pop()?.toLowerCase() || ''], data };
      }
      const activeAlertsCount = alerts.filter(a => !a.resolved).length;
      const response = await fetch('/api/ai/ask-command', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ command, attachment, context:{ hostname:selectedNode.hostname, cpuUsage:currentMetric.cpuUsage, ramUsagePercent:currentMetric.ramUsagePercent, ramUsedGb:currentMetric.ramUsedGb, activeAlertsCount, is2FaActive:isTwoFactorActive, latencyMs:currentMetric.latencyMs } }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Assistant API request failed');
      const reply = payload.reply || 'The request was received.';
      let actionTaken = '';
      if (payload.action === 'NAVIGATE' && payload.targetTab) { onNavigateTab(payload.targetTab as TabType); actionTaken = 'Workspace opened: ' + payload.targetTab; }
      else if (payload.action === 'TRIGGER_SPIKE') { onSimulateCpuSpike(); actionTaken = 'CPU load simulation triggered'; }
      else if (payload.action === 'OPEN_REPORTS') { onOpenReports(); actionTaken = 'Report center opened'; }
      setMessages(prev => [...prev, { id:'usr-'+Date.now(), sender:'user', text:file ? (command || 'Read this file') + ' · ' + file.name : command, timestamp:clock() }, { id:'ast-'+Date.now(), sender:'assistant', text:reply, actionTaken:actionTaken || undefined, timestamp:clock() }]);
      setTranscript(''); setSelectedFile(null); speakText(reply);
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'Unknown error';
      setMessages(prev => [...prev, { id:'err-'+Date.now(), sender:'assistant', text:'Could not process request: '+detail+'. Draft and file are preserved for retry.', timestamp:clock() }]);
    } finally { submittingRef.current = false; setIsLoading(false); inputRef.current?.focus(); }
  };



  if (!isOpen) return null;

  const quickPrompts = [
    { icon: Cpu, label: 'Inspect CPU & memory', command: 'Inspect current CPU and memory usage and explain any concerns.' },
    { icon: Activity, label: 'Active incidents', command: 'Summarize active server alerts and recommend next steps.' },
    { icon: Terminal, label: 'Deployment status', command: 'Open deployments and inspect the latest deployment status.' },
    { icon: ShieldCheck, label: 'Security review', command: 'Review the current security and 2FA status.' },
    { icon: FileText, label: 'Generate report', command: 'Open the performance report center.' },
  ];

  return (
    <div className="fixed inset-0 z-[100] bg-[#050505] text-[#f5f5f5] flex flex-col animate-fade-in">
      <header className="h-16 shrink-0 border-b border-[#262626] bg-black flex items-center justify-between px-4 sm:px-6">
        <div className="flex items-center gap-3 min-w-0">
          <div className="h-9 w-9 shrink-0 border border-[#333] bg-[#090909] grid place-items-center overflow-hidden">
            <img src={`${import.meta.env.BASE_URL}velclaw-icon-dark.svg`} alt="VelClaw" className="h-full w-full object-cover" />
          </div>
          <div className="min-w-0">
            <h2 className="text-sm sm:text-base font-semibold tracking-tight">VelClaw AI</h2>
            <p className="text-[10px] sm:text-xs text-[#858585] font-mono tracking-wide">Open DevOps assistant</p>
          </div>
          <span className="hidden md:inline-flex ml-3 items-center gap-2 border border-[#292929] px-2.5 py-1 text-[9px] uppercase tracking-[.16em] text-[#a3a3a3]">
            <span className="h-1.5 w-1.5 bg-[#168bff]" /> Workspace assistant
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="hidden sm:flex items-center gap-2 border-r border-[#262626] pr-3 mr-1 text-[10px] font-mono text-[#777]">
            <span className={`h-1.5 w-1.5 ${isSpeaking ? 'bg-[#168bff] animate-pulse' : 'bg-[#555]'}`} />
            {isListening ? 'LISTENING' : isSpeaking ? 'SPEAKING' : 'READY'}
          </div>
          <button onClick={() => { if (voiceEnabled) window.speechSynthesis?.cancel(); setVoiceEnabled(v => !v); }} className={`h-9 w-9 border grid place-items-center ${voiceEnabled ? 'border-[#343434] text-[#ddd]' : 'border-[#262626] text-[#666]'} hover:bg-[#151515]`} title={voiceEnabled ? 'Disable voice responses' : 'Enable voice responses'}>
            {voiceEnabled ? <Volume2 size={16} /> : <VolumeX size={16} />}
          </button>
          <button onClick={onClose} className="h-9 w-9 border border-[#343434] text-[#aaa] grid place-items-center hover:bg-[#171717] hover:text-white" aria-label="Close VelClaw AI"><X size={17} /></button>
        </div>
      </header>

      <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-[260px_minmax(0,1fr)]">
        <aside className="hidden lg:flex flex-col border-r border-[#262626] bg-[#080808] p-4">
          <div className="text-[9px] uppercase tracking-[.18em] text-[#686868] font-semibold mb-3">Active environment</div>
          <div className="border border-[#292929] p-3 bg-[#0c0c0c]">
            <div className="flex items-center gap-2 text-xs font-medium"><span className="h-1.5 w-1.5 bg-[#168bff]" />{selectedNode.hostname}</div>
            <div className="mt-1 text-[10px] text-[#777] font-mono">{selectedNode.region || 'Region unavailable'}</div>
          </div>
          <div className="mt-5 text-[9px] uppercase tracking-[.18em] text-[#686868] font-semibold mb-3">Live context</div>
          <div className="space-y-2">
            {[
              ['CPU', `${currentMetric.cpuUsage}%`],
              ['Memory', `${currentMetric.ramUsagePercent}%`],
              ['Latency', `${currentMetric.latencyMs} ms`],
              ['Open alerts', String(alerts.filter(a => !a.resolved).length)],
            ].map(([label, value]) => <div key={label} className="flex items-center justify-between border-b border-[#202020] py-2 text-[11px]"><span className="text-[#777]">{label}</span><span className="font-mono text-[#ddd]">{value}</span></div>)}
          </div>
          <div className="mt-auto border border-[#292929] p-3 text-[10px] leading-relaxed text-[#777]">
            <div className="flex items-center gap-2 text-[#bdbdbd] mb-1"><ShieldCheck size={13} /> Safe operations</div>
            VelClaw AI reports actions returned by connected services. Review consequential infrastructure changes before execution.
          </div>
        </aside>

        <section className="min-w-0 min-h-0 flex flex-col bg-[#050505]">
          <div className="h-11 shrink-0 border-b border-[#202020] px-4 sm:px-7 flex items-center justify-between">
            <div className="flex items-center gap-2 text-[10px] font-mono text-[#777]"><Command size={13} /><span>VELCLAW / AI WORKSPACE</span><span className="text-[#444]">/</span><span className="text-[#ddd]">CHAT</span></div>
            <button onClick={() => setMessages([{ id: `welcome-${Date.now()}`, sender: 'assistant', text: 'I’m VelClaw AI. What DevOps task can I help you with?', timestamp: clock() }])} className="text-[10px] text-[#888] hover:text-white border-b border-transparent hover:border-[#777]">New conversation</button>
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto px-4 sm:px-7 py-6 sm:py-8">
            <div className="max-w-3xl mx-auto">
              {messages.length === 1 && (
                <div className="mb-8 sm:mb-12 pt-3 sm:pt-8">
                  <div className="h-10 w-10 border border-[#333] bg-[#0b0b0b] grid place-items-center mb-5"><Sparkles size={18} className="text-[#168bff]" /></div>
                  <div className="text-[10px] font-mono uppercase tracking-[.2em] text-[#168bff] mb-3">DevOps intelligence</div>
                  <h1 className="text-2xl sm:text-4xl font-semibold tracking-tight leading-tight">What are we <span className="text-[#777]">building</span> today?</h1>
                  <p className="mt-3 text-sm text-[#858585] max-w-xl leading-6">Ask about infrastructure, deployments, observability, security or your development workflow.</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-7">
                    {quickPrompts.map(({ icon: Icon, label, command }) => <button key={label} onClick={() => void handleSendCommand(command)} className="group min-h-12 border border-[#292929] bg-[#090909] hover:bg-[#111] hover:border-[#4a4a4a] px-3 py-3 flex items-center gap-3 text-left"><Icon size={15} className="text-[#168bff] shrink-0" /><span className="text-[11px] text-[#c5c5c5]">{label}</span><ArrowUpRight size={13} className="ml-auto text-[#555] group-hover:text-white" /></button>)}
                  </div>
                </div>
              )}

              <div className="space-y-6">
                {messages.map(msg => <article key={msg.id} className={`flex gap-3 sm:gap-4 ${msg.sender === 'user' ? 'flex-row-reverse' : ''}`}>
                  <div className={`h-8 w-8 shrink-0 border grid place-items-center ${msg.sender === 'assistant' ? 'border-[#303030] bg-[#101010] text-[#168bff]' : 'border-[#383838] bg-[#191919] text-[#ddd]'}`}>{msg.sender === 'assistant' ? <Bot size={15} /> : <User size={15} />}</div>
                  <div className={`min-w-0 max-w-[88%] sm:max-w-[80%] ${msg.sender === 'user' ? 'text-right' : ''}`}>
                    <div className="flex items-center gap-2 mb-1.5"><span className="text-[10px] font-semibold text-[#ddd]">{msg.sender === 'assistant' ? 'VelClaw AI' : 'You'}</span><span className="text-[9px] font-mono text-[#666]">{msg.timestamp}</span></div>
                    <div className={`text-[13px] leading-6 whitespace-pre-wrap text-left ${msg.sender === 'user' ? 'inline-block border border-[#24476a] bg-[#0b1723] px-3.5 py-2.5 text-[#e4edf7]' : 'text-[#c7c7c7]'}`}>{msg.text}</div>
                    {msg.actionTaken && <div className="mt-2 inline-flex items-center gap-2 border border-[#21432f] bg-[#0b160f] px-2.5 py-1.5 text-[10px] text-[#9bd5ad]"><CheckCircle2 size={12} />{msg.actionTaken}</div>}
                  </div>
                </article>)}
                {isLoading && <div className="flex gap-3"><div className="h-8 w-8 border border-[#303030] bg-[#101010] text-[#168bff] grid place-items-center"><Bot size={15} /></div><div className="pt-2 text-[11px] text-[#888] flex items-center gap-2"><span className="h-1.5 w-1.5 bg-[#168bff] animate-pulse" />VelClaw AI is analyzing your request…</div></div>}
                <div ref={messagesEndRef} />
              </div>
            </div>
          </div>

          <div className="shrink-0 border-t border-[#252525] bg-[#080808] px-3 sm:px-7 pt-3 pb-[max(12px,env(safe-area-inset-bottom))]">
            <div className="max-w-3xl mx-auto">
              {(isListening || isSpeaking) && <div className="mb-2 flex items-center gap-2 text-[10px] font-mono text-[#168bff]"><AudioLines size={13} />{isListening ? 'Listening for your command…' : 'Speaking response…'}</div>}
              <input ref={fileInputRef} type="file" accept=".pdf,.png,.jpg,.jpeg,.webp,.txt,.md,.csv,.json" className="hidden" onChange={e => {
 const f=e.target.files?.[0]; e.target.value=''; if(!f)return;
 const m:Record<string,string>={pdf:'application/pdf',png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',webp:'image/webp',txt:'text/plain',md:'text/markdown',csv:'text/csv',json:'application/json'};
 const ext=f.name.split('.').pop()?.toLowerCase()||'', expected=m[ext];
 if(!expected||f.size>8*1024*1024||(f.type&&f.type!==expected&&f.type!=='application/octet-stream')){setMessages(p=>[...p,{id:'file-error-'+Date.now(),sender:'assistant',text:'Unsupported file or file exceeds 8 MB.',timestamp:clock()}]);return;}
 setSelectedFile(f);
}} />
{selectedFile && <div className="mb-2 flex items-center gap-2 border border-[#303030] px-3 py-2 text-[11px] text-[#ccc]"><Paperclip size={14}/><span className="flex-1 truncate">{selectedFile.name}</span><button type="button" onClick={()=>setSelectedFile(null)} aria-label="Remove attachment"><X size={14}/></button></div>}
<form onSubmit={e => { e.preventDefault(); void handleSendCommand(transcript); }} className="flex items-center gap-2 border border-[#383838] bg-[#050505] p-1.5 focus-within:border-[#168bff]">
                <button type="button" onClick={() => fileInputRef.current?.click()} className="h-10 w-10 shrink-0 grid place-items-center text-[#888]" title="Upload file" aria-label="Upload file"><Paperclip size={18}/></button>
                <input ref={inputRef} value={transcript} onChange={e => setTranscript(e.target.value)} placeholder="Message VelClaw AI or attach a file…" className="min-w-0 flex-1 bg-transparent px-2 py-2 text-[13px] text-white outline-none placeholder:text-[#666]" />
                <button type="submit" disabled={(!transcript.trim() && !selectedFile) || isLoading} className="h-10 w-10 shrink-0 bg-[#f5f5f5] text-black grid place-items-center hover:bg-white disabled:opacity-30 disabled:cursor-not-allowed" aria-label="Send message"><Send size={16} /></button>
              </form>
              <div className="mt-2 flex items-center justify-between text-[9px] text-[#626262]"><span>VelClaw AI can make mistakes. Verify critical infrastructure changes.</span><span className="hidden sm:inline font-mono">ENTER TO SEND</span></div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
};
