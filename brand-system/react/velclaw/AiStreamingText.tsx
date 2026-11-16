import "./AiStreamingText.css";
import { AiThinkingIndicator } from "./AiThinkingIndicator";

type AiStreamingTextProps = {
  text: string;
  isStreaming: boolean;
  /** Hiển thị AI Thinking trước chunk đầu tiên. */
  showThinking?: boolean;
  /** Nhãn đọc bởi screen reader và hiển thị ở trạng thái đang stream. */
  respondingLabel?: string;
  className?: string;
};

export function AiStreamingText({
  text,
  isStreaming,
  showThinking = true,
  respondingLabel = "VELCLAW is responding",
  className = "",
}: AiStreamingTextProps) {
  const waitingForFirstChunk = isStreaming && text.length === 0;
  const showThinkingState = waitingForFirstChunk && showThinking;

  return (
    <div
      className={`vc-streaming-text ${isStreaming ? "is-streaming" : "is-complete"} ${className}`.trim()}
      role="status"
      aria-live="polite"
      aria-busy={isStreaming}
    >
      {showThinkingState ? (
        <AiThinkingIndicator status="thinking" />
      ) : (
        <>
          <p className="vc-streaming-text__content">
            {text}
            {isStreaming && <span className="vc-streaming-text__caret" aria-hidden="true" />}
          </p>
          {isStreaming && (
            <span className="vc-streaming-text__meta">
              <span className="vc-streaming-text__live-dot" aria-hidden="true" />
              <span>{respondingLabel}</span>
              <span className="vc-streaming-text__dots" aria-hidden="true">•••</span>
            </span>
          )}
        </>
      )}
    </div>
  );
}
