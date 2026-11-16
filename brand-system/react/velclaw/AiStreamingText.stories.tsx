import type { Meta, StoryObj } from "@storybook/react";
import { useEffect, useMemo, useState } from "react";
import { AiStreamingText } from "./AiStreamingText";

const meta = {
  title: "VELCLAW/AiStreamingText",
  component: AiStreamingText,
  parameters: {
    layout: "centered",
    backgrounds: {
      default: "carbon",
      values: [
        { name: "carbon", value: "#0B0C0F" },
        { name: "cloud", value: "#F7F8FA" },
      ],
    },
  },
  argTypes: {
    text: { control: "text" },
    isStreaming: { control: "boolean" },
    showThinking: { control: "boolean" },
    respondingLabel: { control: "text" },
  },
} satisfies Meta<typeof AiStreamingText>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Thinking: Story = {
  args: {
    text: "",
    isStreaming: true,
    showThinking: true,
  },
};

export const Streaming: Story = {
  args: {
    text: "The clearest next move is to reduce the first step to one measurable action.",
    isStreaming: true,
    showThinking: true,
  },
};

export const Ready: Story = {
  args: {
    text: "The answer is ready. The next move is clear.",
    isStreaming: false,
    showThinking: true,
  },
};

export const EmptyWithoutThinking: Story = {
  args: {
    text: "",
    isStreaming: true,
    showThinking: false,
  },
};

export const ErrorState: Story = {
  render: () => (
    <div style={panelStyle}>
      <AiStreamingText
        text=""
        isStreaming={false}
        showThinking={false}
      />
      <p role="alert" style={errorStyle}>
        Không thể nhận câu trả lời. Vui lòng thử lại.
      </p>
    </div>
  ),
};

export const InteractiveSimulation: Story = {
  render: () => <StreamingPlayground />,
};

const sampleChunks = [
  "VELCLAW sees the signal. ",
  "The clearest next move ",
  "is to reduce the first step ",
  "to one measurable action.",
];

function StreamingPlayground() {
  const [status, setStatus] = useState<"idle" | "thinking" | "streaming" | "ready" | "error">("idle");
  const [text, setText] = useState("");
  const [chunkIndex, setChunkIndex] = useState(0);

  const isStreaming = status === "thinking" || status === "streaming";
  const visibleLabel = useMemo(() => {
    if (status === "thinking") return "Thinking: waiting for first chunk";
    if (status === "streaming") return `Streaming: chunk ${chunkIndex}/${sampleChunks.length}`;
    if (status === "ready") return "Ready: stream complete";
    if (status === "error") return "Error: request failed";
    return "Idle: ready to start";
  }, [chunkIndex, status]);

  useEffect(() => {
    if (status !== "streaming") return;
    if (chunkIndex >= sampleChunks.length) {
      setStatus("ready");
      return;
    }

    const timer = window.setTimeout(() => {
      setText((current) => current + sampleChunks[chunkIndex]);
      setChunkIndex((current) => current + 1);
    }, 650);

    return () => window.clearTimeout(timer);
  }, [chunkIndex, status]);

  function startSimulation() {
    setText("");
    setChunkIndex(0);
    setStatus("thinking");
    window.setTimeout(() => setStatus("streaming"), 900);
  }

  function reset() {
    setText("");
    setChunkIndex(0);
    setStatus("idle");
  }

  return (
    <div style={panelStyle}>
      <div style={toolbarStyle}>
        <span style={eyebrowStyle}>Interactive response test</span>
        <span style={statusStyle}>{visibleLabel}</span>
      </div>

      <div style={chatStyle}>
        <span style={promptStyle}>User</span>
        <p style={promptTextStyle}>Help me find the clearest next move.</p>
      </div>

      <AiStreamingText
        text={text}
        isStreaming={isStreaming}
        showThinking
      />

      {status === "error" && (
        <p role="alert" style={errorStyle}>
          Stream interrupted. Retry the request.
        </p>
      )}

      <div style={controlsStyle}>
        <button type="button" onClick={startSimulation} style={primaryButtonStyle}>
          Start stream
        </button>
        <button type="button" onClick={() => setStatus("error")} style={secondaryButtonStyle}>
          Simulate error
        </button>
        <button type="button" onClick={reset} style={secondaryButtonStyle}>
          Reset
        </button>
      </div>
    </div>
  );
}

const panelStyle = {
  width: "min(680px, calc(100vw - 48px))",
  minHeight: 260,
  padding: 24,
  background: "#111317",
  color: "#F7F8FA",
  border: "1px solid rgba(255,255,255,.14)",
  fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif",
};

const toolbarStyle = { display: "flex", justifyContent: "space-between", gap: 16, marginBottom: 48 };
const eyebrowStyle = { color: "#2F80FF", fontSize: 10, letterSpacing: ".14em", textTransform: "uppercase" as const };
const statusStyle = { color: "#8E939E", fontSize: 10, letterSpacing: ".08em" };
const chatStyle = { display: "flex", gap: 12, alignItems: "baseline", marginBottom: 38 };
const promptStyle = { color: "#8E939E", fontSize: 10, textTransform: "uppercase" as const, letterSpacing: ".12em" };
const promptTextStyle = { margin: 0, color: "#C7CBD4", fontSize: 14 };
const controlsStyle = { display: "flex", flexWrap: "wrap" as const, gap: 8, marginTop: 42 };
const primaryButtonStyle = { border: 0, padding: "10px 13px", background: "#F7F8FA", color: "#0B0C0F", cursor: "pointer", fontSize: 10, letterSpacing: ".1em", textTransform: "uppercase" as const };
const secondaryButtonStyle = { border: "1px solid rgba(255,255,255,.18)", padding: "9px 12px", background: "transparent", color: "#F7F8FA", cursor: "pointer", fontSize: 10, letterSpacing: ".1em", textTransform: "uppercase" as const };
const errorStyle = { margin: "18px 0 0", color: "#ff7b8a", fontSize: 12 };
