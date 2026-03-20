import { useRecordingState, RecordingState } from "../hooks/useRecordingState";

const stateConfig: Record<
  RecordingState,
  { label: string; color: string; pulse: boolean }
> = {
  idle: { label: "Ready", color: "bg-gray-600", pulse: false },
  recording: { label: "Recording...", color: "bg-red-500", pulse: true },
  processing: { label: "Processing...", color: "bg-yellow-500", pulse: true },
  error: { label: "Error", color: "bg-red-700", pulse: false },
};

export function StatusIndicator() {
  const { state, lastTranscription, error } = useRecordingState();
  const config = stateConfig[state];

  return (
    <div className="p-4 space-y-3">
      <div className="flex items-center gap-3">
        <div className="relative">
          <div
            className={`w-3 h-3 rounded-full ${config.color}`}
          />
          {config.pulse && (
            <div
              className={`absolute inset-0 w-3 h-3 rounded-full ${config.color} animate-ping`}
            />
          )}
        </div>
        <span className="text-sm font-medium text-white">{config.label}</span>
      </div>

      {error && (
        <p className="text-xs text-red-400">{error}</p>
      )}

      {lastTranscription && state === "idle" && (
        <p className="text-xs text-gray-400 truncate max-w-[180px]">
          {lastTranscription}
        </p>
      )}
    </div>
  );
}
