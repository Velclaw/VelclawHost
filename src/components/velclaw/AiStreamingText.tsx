import "./AiStreamingText.css";
import { AiThinkingIndicator } from "./AiThinkingIndicator";

export type AiStreamingTextProps = {
  text: string;
  isStreaming: boolean;
  showThinking?: boolean;
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

  return (
    <div
      className={`vc-streaming-text ${isStreaming ? "is-streaming" : "is-complete"} ${className}`.trim()}
      role="status"
      aria-live="polite"
      aria-busy={isStreaming}
    >
      {waitingForFirstChunk && showThinking ? (
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
