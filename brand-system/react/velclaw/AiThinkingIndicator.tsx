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
