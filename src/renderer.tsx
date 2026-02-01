import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import * as PIXI from "pixi.js";
import { Live2DModel } from "pixi-live2d-display";
import "./index.css";

(window as typeof window & { PIXI?: typeof PIXI }).PIXI = PIXI;

type Mode = "focus" | "break";

type ModeConfig = {
  label: string;
  seconds: number;
};

const MODES: Record<Mode, ModeConfig> = {
  focus: { label: "Focus", seconds: 25 * 60 },
  break: { label: "Break", seconds: 5 * 60 },
};

const formatTime = (totalSeconds: number) => {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
};

const LIVE2D_MODEL_URL = "/live2d/hiyori/hiyori_pro_t11.model3.json";

const Live2DStage = () => {
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
      const scale = Math.min(
        width / modelBaseSize.width,
        height / modelBaseSize.height,
      );
      model.scale.set(scale);
      model.pivot.set(modelBaseSize.width / 2, modelBaseSize.height / 2);
      model.position.set(width / 2, height / 2);
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
    <div className="relative flex h-100 w-full max-w-4xl items-center justify-center overflow-hidden rounded-2xl bg-gray-200">
      {/* Live2D canvas mounts into this container. */}
      {!isLoaded && (
        <span className="pointer-events-none relative z-10 text-sm font-medium text-gray-500">
          Loading model...
        </span>
      )}
      <div ref={containerRef} className="absolute inset-0" />
    </div>
  );
};

const App = () => {
  const [mode, setMode] = useState<Mode>("focus");
  const [remaining, setRemaining] = useState(MODES.focus.seconds);
  const [isRunning, setIsRunning] = useState(false);

  const total = MODES[mode].seconds;

  useEffect(() => {
    if (!isRunning) return undefined;

    const interval = window.setInterval(() => {
      setRemaining((prev) => {
        if (prev <= 1) {
          const nextMode: Mode = mode === "focus" ? "break" : "focus";
          setMode(nextMode);
          return MODES[nextMode].seconds;
        }
        return prev - 1;
      });
    }, 1000);

    return () => window.clearInterval(interval);
  }, [isRunning, mode]);

  const formattedTime = useMemo(() => formatTime(remaining), [remaining]);
  const showResume = !isRunning && remaining !== total;
  const primaryLabel = isRunning ? "Pause" : showResume ? "Resume" : "Start";
  const switchLabel = mode === "focus" ? "Break" : "Focus";

  const handleToggle = () => setIsRunning((prev) => !prev);
  const handleSwitchMode = () => {
    const nextMode: Mode = mode === "focus" ? "break" : "focus";
    setIsRunning(false);
    setMode(nextMode);
    setRemaining(MODES[nextMode].seconds);
  };

  return (
    <div className="flex min-h-screen flex-col bg-white px-6 py-6 text-gray-900">
      <section className="flex flex-1 items-center justify-center pb-6">
        <Live2DStage />
      </section>

      <section className="text-center">
        <h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-gray-500">
          {MODES[mode].label} Timer
        </h2>
        <h1
          className="mt-3 text-[clamp(3rem,8vw,5rem)] font-semibold tabular-nums"
          aria-live="polite"
        >
          {formattedTime}
        </h1>
      </section>

      <section className="flex items-center justify-center gap-4 pb-6 pt-8">
        <button
          className="rounded-full bg-gray-900 px-8 py-3 text-sm font-semibold text-white transition active:scale-[0.98]"
          type="button"
          onClick={handleToggle}
        >
          {primaryLabel}
        </button>
        <button
          className="rounded-full border border-gray-300 px-8 py-3 text-sm font-semibold text-gray-700 transition hover:bg-gray-100 active:scale-[0.98]"
          type="button"
          onClick={handleSwitchMode}
        >
          {switchLabel}
        </button>
      </section>
    </div>
  );
};

const root = document.getElementById("root");
if (root) {
  createRoot(root).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
}
