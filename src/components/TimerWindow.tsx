import React, { useCallback, useEffect, useRef, useState } from "react";
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
const LIP_SYNC_GAIN = 9;
const LIP_SYNC_SILENCE_THRESHOLD = 0.002;
const LIP_SYNC_ATTACK = 0.6;
const LIP_SYNC_RELEASE = 0.3;

type VoiceAudioSignal = {
  audio: HTMLAudioElement | null;
  token: number;
};

type Live2DCoreModel = {
  setParameterValueById?: (id: string, value: number) => void;
  setParamFloat?: (id: string, value: number) => void;
};

type InternalModelWithEvents = {
  coreModel?: Live2DCoreModel;
  on: (event: "afterMotionUpdate", handler: () => void) => void;
  off: (event: "afterMotionUpdate", handler: () => void) => void;
};

type Live2DStageProps = {
  activeAppName?: string;
  showActiveApp?: boolean;
  voiceAudioSignal?: VoiceAudioSignal;
};

const Live2DStage = ({
  activeAppName,
  showActiveApp,
  voiceAudioSignal,
}: Live2DStageProps) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const live2dModelRef = useRef<Live2DModel | null>(null);
  const lipSyncIdsRef = useRef<string[]>(["ParamMouthOpenY"]);
  const mouthOpenRef = useRef(0);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const analyserBufferRef = useRef<Uint8Array | null>(null);
  const audioSourcesRef = useRef(
    new Map<HTMLAudioElement, MediaElementAudioSourceNode>(),
  );
  const audioListenersRef = useRef(
    new Map<
      HTMLAudioElement,
      { onPlay: () => void; onPause: () => void; onEnded: () => void }
    >(),
  );
  const activeAudioRef = useRef<HTMLAudioElement | null>(null);
  const internalModelRef = useRef<InternalModelWithEvents | null>(null);

  // Wire a voice audio element into a shared AudioContext + analyser so we can
  // read its volume in real time and drive the mouth parameter while it plays.
  const setupVoiceAudio = useCallback((audio: HTMLAudioElement) => {
    const AudioContextCtor =
      window.AudioContext ||
      (window as typeof window & { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!AudioContextCtor) return;

    if (!audioContextRef.current) {
      audioContextRef.current = new AudioContextCtor();
    }
    const audioContext = audioContextRef.current;

    if (!analyserRef.current) {
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 2048;
      analyser.smoothingTimeConstant = 0.6;
      analyser.connect(audioContext.destination);
      analyserRef.current = analyser;
      analyserBufferRef.current = new Uint8Array(analyser.fftSize);
    }
    const analyser = analyserRef.current;
    if (!analyser) return;

    if (!audioSourcesRef.current.has(audio)) {
      const source = audioContext.createMediaElementSource(audio);
      source.connect(analyser);
      audioSourcesRef.current.set(audio, source);
    }

    if (!audioListenersRef.current.has(audio)) {
      const handlePlay = () => {
        activeAudioRef.current = audio;
        if (audioContextRef.current?.state === "suspended") {
          void audioContextRef.current.resume();
        }
      };
      const handlePause = () => {
        if (activeAudioRef.current === audio) {
          activeAudioRef.current = null;
        }
      };
      const handleEnded = () => {
        if (activeAudioRef.current === audio) {
          activeAudioRef.current = null;
        }
      };
      audio.addEventListener("play", handlePlay);
      audio.addEventListener("pause", handlePause);
      audio.addEventListener("ended", handleEnded);
      audioListenersRef.current.set(audio, {
        onPlay: handlePlay,
        onPause: handlePause,
        onEnded: handleEnded,
      });
    }

    if (!audio.paused && !audio.ended) {
      activeAudioRef.current = audio;
    }
    if (audioContext.state === "suspended") {
      void audioContext.resume();
    }
  }, []);

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
    // Sample the current voice audio amplitude, smooth it, then write that
    // value into the model's mouth-open parameter each frame.
    const updateLipSync = () => {
      const modelInstance = live2dModelRef.current;
      const coreModel = modelInstance?.internalModel?.coreModel as
        | Live2DCoreModel
        | undefined;
      const ids = lipSyncIdsRef.current;
      if (!coreModel || ids.length === 0) return;

      const analyser = analyserRef.current;
      const activeAudio = activeAudioRef.current;
      let target = 0;

      if (activeAudio && analyser && !activeAudio.paused && !activeAudio.ended) {
        const buffer = analyserBufferRef.current;
        if (buffer) {
          analyser.getByteTimeDomainData(buffer);
          let sum = 0;
          for (let i = 0; i < buffer.length; i += 1) {
            const normalized = (buffer[i] - 128) / 128;
            sum += normalized * normalized;
          }
          const rms = Math.sqrt(sum / buffer.length);
          target = Math.min(1, rms * LIP_SYNC_GAIN);
          if (target < LIP_SYNC_SILENCE_THRESHOLD) {
            target = 0;
          }
        }
      }

      const current = mouthOpenRef.current;
      const smoothing = target > current ? LIP_SYNC_ATTACK : LIP_SYNC_RELEASE;
      const next = current + (target - current) * smoothing;
      mouthOpenRef.current = next;
      const value = Math.max(0, Math.min(1, next));

      if (coreModel.setParameterValueById) {
        ids.forEach((id) => coreModel.setParameterValueById?.(id, value));
      } else if (coreModel.setParamFloat) {
        ids.forEach((id) => coreModel.setParamFloat?.(id, value));
      }
    };
    const useInternalEventsRef = { current: false };
    const tickLipSync = () => {
      if (useInternalEventsRef.current) return;
      updateLipSync();
    };
    app.ticker.add(tickLipSync);

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
          // Disable built-in idle motions so the model only moves when we drive it.
          idleMotionGroup: "__none__",
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
        live2dModelRef.current = model;
        model.once("ready", () => {
          const internalModel =
            model?.internalModel as unknown as InternalModelWithEvents;
          if (internalModel?.on) {
            internalModel.on("afterMotionUpdate", updateLipSync);
            internalModelRef.current = internalModel;
            useInternalEventsRef.current = true;
          }
          if (internalModel && "lipSync" in internalModel) {
            (internalModel as { lipSync?: boolean }).lipSync = false;
          }
        });
        void (async () => {
          try {
            const response = await fetch(LIVE2D_MODEL_URL);
            if (!response.ok) return;
            const data = (await response.json()) as {
              Groups?: Array<{
                Target?: string;
                Name?: string;
                Ids?: string[];
              }>;
            };
            const groups = Array.isArray(data?.Groups) ? data.Groups : [];
            const lipSyncGroup = groups.find(
              (group) =>
                group?.Target === "Parameter" &&
                group?.Name === "LipSync" &&
                Array.isArray(group?.Ids),
            );
            if (lipSyncGroup?.Ids?.length) {
              lipSyncIdsRef.current = lipSyncGroup.Ids.filter(
                (id) => typeof id === "string",
              );
            }
          } catch (error) {
            console.warn("Failed to load lip sync parameters", error);
          }
        })();
        setIsLoaded(true);
      } catch (error) {
        console.error("Failed to load Live2D model", error);
      }
    };

    loadModel();

    return () => {
      destroyed = true;
      if (internalModelRef.current) {
        internalModelRef.current.off("afterMotionUpdate", updateLipSync);
        internalModelRef.current = null;
      }
      app.ticker.remove(tickLipSync);
      app.renderer.off("resize", fitModel);
      if (canvas && canvas.parentNode === container) {
        container.removeChild(canvas);
      }
      app.destroy(true, { children: true, texture: true, baseTexture: true });
      audioListenersRef.current.forEach((handlers, audio) => {
        audio.removeEventListener("play", handlers.onPlay);
        audio.removeEventListener("pause", handlers.onPause);
        audio.removeEventListener("ended", handlers.onEnded);
      });
      audioListenersRef.current.clear();
      audioSourcesRef.current.forEach((source) => source.disconnect());
      audioSourcesRef.current.clear();
      activeAudioRef.current = null;
      mouthOpenRef.current = 0;
      analyserBufferRef.current = null;
      analyserRef.current?.disconnect();
      analyserRef.current = null;
      if (audioContextRef.current) {
        void audioContextRef.current.close();
        audioContextRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!voiceAudioSignal?.audio) return;
    setupVoiceAudio(voiceAudioSignal.audio);
  }, [setupVoiceAudio, voiceAudioSignal?.token]);

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
  const [voiceAudioSignal, setVoiceAudioSignal] = useState<VoiceAudioSignal>({
    audio: null,
    token: 0,
  });
  const handleVoiceAudioPlay = useCallback((audio: HTMLAudioElement) => {
    setVoiceAudioSignal({ audio, token: Date.now() });
  }, []);
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
  } = usePomodoroTimer(config, { onVoiceAudioPlay: handleVoiceAudioPlay });

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
          voiceAudioSignal={voiceAudioSignal}
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
