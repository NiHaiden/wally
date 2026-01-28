import { useCallback } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";

export function TitleBar() {
  const handleDragStart = useCallback(async (e: React.MouseEvent) => {
    if (e.button === 0) {
      await getCurrentWindow().startDragging();
    }
  }, []);

  return (
    <div
      onMouseDown={handleDragStart}
      className="fixed inset-x-0 top-0 z-50 h-12 bg-background/80 backdrop-blur-xl border-b border-border/50 cursor-default"
    />
  );
}
