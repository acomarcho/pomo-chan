import React, { useEffect, useRef, useState } from "react";
import * as PIXI from "pixi.js";
import { Live2DModel } from "pixi-live2d-display";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Settings2 } from "lucide-react";
import { MODES, formatTime } from "@/lib/pomodoro";
import {
  useActiveAppName,
  useAlwaysOnTop,
  useAppConfig,
  useConfigWindowOpener,
} from "@/lib/hooks/app-hooks";
import { usePomodoroTimer } from "@/lib/hooks/timer-hooks";

(window as typeof window & { PIXI?: typeof PIXI }).PIXI = PIXI;

const LIVE2D_MODEL_URL = `${import.meta.env.BASE_URL}live2d/hiyori/hiyori_pro_t11.model3.json`;
const LIVE2D_ZOOM = 3;
const LIVE2D_Y_OFFSET = 0.9;

type Live2DStageProps = {
  activeAppName?: string;
  showActiveApp?: boolean;
};

const Live2DStage = ({ activeAppName, showActiveApp }: Live2DStageProps) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return undefined;

    let destroyed = false;

    const app = new PIXI.Application({
      backgroundAlpha: 0,
      antialias: true,
      autoDensity: true,
      resizeTo: container,
    });

    const canvas = app.view as HTMLCanvasElement;
    container.appendChild(canvas);
    canvas.style.width = "100%";
    canvas.style.height = "100%";
    canvas.style.display = "block";

    let model: Live2DModel | null = null;
    const modelBaseSize = { width: 0, height: 0 };

    const fitModel = () => {
      if (!model) return;
      const { width, height } = app.renderer;
      if (!width || !height || !modelBaseSize.width || !modelBaseSize.height) {
        return;
      }
      const scale =
        Math.min(width / modelBaseSize.width, height / modelBaseSize.height) *
        LIVE2D_ZOOM;
      model.scale.set(scale);
      model.pivot.set(modelBaseSize.width / 2, modelBaseSize.height / 2);
      model.position.set(width / 2, height / 2 + height * LIVE2D_Y_OFFSET);
    };

    const loadModel = async () => {
      try {
        model = await Live2DModel.from(LIVE2D_MODEL_URL, {
          autoInteract: true,
        });
        if (destroyed) {
          model.destroy();
          return;
        }
        model.interactive = true;
        app.stage.addChild(model);
        const bounds = model.getBounds();
        modelBaseSize.width = bounds.width || model.width;
        modelBaseSize.height = bounds.height || model.height;
        fitModel();
        app.renderer.on("resize", fitModel);
        setIsLoaded(true);
      } catch (error) {
        console.error("Failed to load Live2D model", error);
      }
    };

    loadModel();

    return () => {
      destroyed = true;
      app.renderer.off("resize", fitModel);
      if (canvas && canvas.parentNode === container) {
        container.removeChild(canvas);
      }
      app.destroy(true, { children: true, texture: true, baseTexture: true });
    };
  }, []);

  return (
    <div className="relative flex h-65 w-full max-w-3xl items-center justify-center overflow-hidden rounded-2xl bg-gray-200 sm:h-75">
      {/* Live2D canvas mounts into this container. */}
      {!isLoaded && (
        <span className="pointer-events-none relative z-10 text-sm font-medium text-gray-500">
          Loading model...
        </span>
      )}
      {showActiveApp && (
        <div className="absolute bottom-3 left-3 z-10 flex max-w-[70%] items-center gap-2 rounded-full bg-white/90 px-3 py-1.5 text-[0.65rem] font-semibold text-gray-600 shadow-sm backdrop-blur">
          <span className="uppercase tracking-[0.2em]">Active app</span>
          <span className="truncate text-[0.7rem] font-medium text-gray-900">
            {activeAppName || "Unknown"}
          </span>
        </div>
      )}
      <div ref={containerRef} className="absolute inset-0" />
    </div>
  );
};

export const TimerWindow = () => {
  const { config } = useAppConfig();
  const { openConfigWindow, isAvailable: isConfigAvailable } =
    useConfigWindowOpener();
  const {
    value: isAlwaysOnTop,
    setValue: setAlwaysOnTop,
    isAvailable: isAlwaysOnTopAvailable,
  } = useAlwaysOnTop();
  const { name: activeAppName, isAvailable: isActiveAppAvailable } =
    useActiveAppName();
  const {
    mode,
    remaining,
    isRunning,
    total,
    pendingMode,
    isConfirmOpen,
    toggleRunning,
    requestModeSwitch,
    confirmModeSwitch,
    cancelModeSwitch,
  } = usePomodoroTimer(config);

  const formattedTime = formatTime(remaining);
  const showResume = !isRunning && remaining !== total;
  const primaryLabel = isRunning ? "Pause" : showResume ? "Resume" : "Start";
  const switchLabel = mode === "focus" ? "Break" : "Focus";

  return (
    <div className="flex min-h-screen flex-col bg-white px-4 py-4 text-gray-900">
      <div className="fixed right-3 top-3 z-20 flex items-center gap-2">
        <Button
          variant="ghost"
          size="icon-sm"
          className="rounded-full bg-white/90 text-gray-600 shadow-sm backdrop-blur"
          onClick={openConfigWindow}
          disabled={!isConfigAvailable}
          aria-label="Open settings"
        >
          <Settings2 />
        </Button>
        <div className="flex items-center gap-2 rounded-full bg-white/90 px-3 py-1.5 text-[0.65rem] font-semibold uppercase tracking-[0.2em] text-gray-600 shadow-sm backdrop-blur">
          <span>Always on top</span>
          <Switch
            checked={isAlwaysOnTop}
            aria-label="Toggle always on top"
            disabled={!isAlwaysOnTopAvailable}
            onCheckedChange={setAlwaysOnTop}
          />
        </div>
      </div>

      <section className="flex items-center justify-center pb-3">
        <Live2DStage
          activeAppName={activeAppName}
          showActiveApp={isActiveAppAvailable}
        />
      </section>

      <div className="flex flex-1 flex-col justify-end">
        <section className="text-center">
          <h2 className="text-xs font-semibold uppercase tracking-[0.24em] text-gray-500">
            {MODES[mode].label} Timer
          </h2>
          <h1
            className="mt-2 text-[clamp(2.4rem,6.5vw,4rem)] font-semibold leading-none tabular-nums"
            aria-live="polite"
          >
            {formattedTime}
          </h1>
        </section>

        <section className="flex items-center justify-center gap-3 pb-2 pt-4">
          <Button
            className="rounded-full px-6 py-2.5 text-sm font-semibold"
            type="button"
            onClick={toggleRunning}
          >
            {primaryLabel}
          </Button>
          <Button
            className="rounded-full px-6 py-2.5 text-sm font-semibold"
            variant="outline"
            type="button"
            onClick={requestModeSwitch}
          >
            {switchLabel}
          </Button>
        </section>
      </div>

      <Dialog
        open={isConfirmOpen}
        onOpenChange={(open) => {
          if (!open) cancelModeSwitch();
        }}
      >
        <DialogContent className="text-left">
          <DialogHeader>
            <DialogTitle>
              Switch to {pendingMode ? MODES[pendingMode].label : switchLabel}{" "}
              timer?
            </DialogTitle>
            <DialogDescription>
              Your current timer progress will be lost if you switch modes.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" type="button" onClick={cancelModeSwitch}>
              Keep {MODES[mode].label}
            </Button>
            <Button
              variant="destructive"
              type="button"
              onClick={confirmModeSwitch}
            >
              Switch to {pendingMode ? MODES[pendingMode].label : switchLabel}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
