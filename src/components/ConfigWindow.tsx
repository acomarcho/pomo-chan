import React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { useAppConfig, type AppConfig } from "@/lib/hooks/app-hooks";
import { AMBIENT_SOUNDS, AMBIENT_SOUND_LABELS, type AmbientSound } from "@/lib/ambient";
import { MAX_TIMER_MINUTES, MIN_TIMER_MINUTES } from "@/lib/pomodoro";

type MinutesKey = "focusMinutes" | "breakMinutes";
type MinutesDraft = Record<MinutesKey, string>;

const toMinutesDraft = (config: Pick<AppConfig, MinutesKey>): MinutesDraft => ({
  focusMinutes: String(config.focusMinutes),
  breakMinutes: String(config.breakMinutes)
});

export const ConfigWindow = () => {
  const { config, updateConfig } = useAppConfig();
  const ambientVolumes = config.ambientVolumes;
  const [minutesDraft, setMinutesDraft] = React.useState<MinutesDraft>(() => toMinutesDraft(config));

  React.useEffect(() => {
    setMinutesDraft((prev) => {
      const next = toMinutesDraft(config);
      if (prev.focusMinutes === next.focusMinutes && prev.breakMinutes === next.breakMinutes) {
        return prev;
      }
      return next;
    });
  }, [config.focusMinutes, config.breakMinutes]);

  const handleAmbientChange = (sound: AmbientSound, value: number) => {
    const clamped = Math.min(100, Math.max(0, value));
    updateConfig({
      ambientVolumes: {
        ...ambientVolumes,
        [sound]: clamped
      }
    });
  };

  const handleMinutesChange = (key: MinutesKey) => (event: React.ChangeEvent<HTMLInputElement>) => {
    const raw = event.target.value;
    setMinutesDraft((prev) => ({ ...prev, [key]: raw }));
    if (raw === "") return;
    const value = Number(raw);
    if (Number.isNaN(value)) return;
    updateConfig({ [key]: value } as Partial<AppConfig>);
  };

  const handleMinutesBlur = (key: MinutesKey) => () => {
    const raw = minutesDraft[key];
    const value = Number(raw);

    if (raw === "" || Number.isNaN(value)) {
      setMinutesDraft((prev) => ({ ...prev, [key]: String(config[key]) }));
      return;
    }

    updateConfig({ [key]: value } as Partial<AppConfig>);
  };

  return (
    <div className="min-h-screen bg-white px-4 py-5 text-gray-900">
      <header className="space-y-2 pb-4">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-gray-500">Preferences</p>
        <h1 className="text-2xl font-semibold">Pomodoro settings</h1>
        <p className="text-sm text-gray-500">Changes sync across the timer and this window.</p>
      </header>

      <section className="space-y-4">
        <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="text-sm font-semibold text-gray-900">Clock ticking</h2>
              <p className="text-xs text-gray-500">Play a soft tick while the timer runs.</p>
            </div>
            <Switch
              checked={config.playTick}
              aria-label="Toggle clock ticking"
              onCheckedChange={(value) => updateConfig({ playTick: value })}
            />
          </div>
        </div>

        <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-sm font-semibold text-gray-900">Voice language</h2>
              <p className="text-xs text-gray-500">Start and end announcements.</p>
            </div>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant={config.audioLanguage === "en" ? "default" : "outline"}
                onClick={() => updateConfig({ audioLanguage: "en" })}
              >
                English
              </Button>
              <Button
                size="sm"
                variant={config.audioLanguage === "jp" ? "default" : "outline"}
                onClick={() => updateConfig({ audioLanguage: "jp" })}
              >
                Japanese
              </Button>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
          <div className="space-y-3">
            <div>
              <h2 className="text-sm font-semibold text-gray-900">Session lengths</h2>
              <p className="text-xs text-gray-500">
                Adjust focus and break minutes ({MIN_TIMER_MINUTES}-{MAX_TIMER_MINUTES}).
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <label className="space-y-1.5 text-xs font-semibold text-gray-500">
                <span className="block text-gray-600">Focus</span>
                <Input
                  type="number"
                  min={MIN_TIMER_MINUTES}
                  max={MAX_TIMER_MINUTES}
                  step={1}
                  value={minutesDraft.focusMinutes}
                  onChange={handleMinutesChange("focusMinutes")}
                  onBlur={handleMinutesBlur("focusMinutes")}
                  aria-label="Focus minutes"
                />
              </label>
              <label className="space-y-1.5 text-xs font-semibold text-gray-500">
                <span className="block text-gray-600">Break</span>
                <Input
                  type="number"
                  min={MIN_TIMER_MINUTES}
                  max={MAX_TIMER_MINUTES}
                  step={1}
                  value={minutesDraft.breakMinutes}
                  onChange={handleMinutesChange("breakMinutes")}
                  onBlur={handleMinutesBlur("breakMinutes")}
                  aria-label="Break minutes"
                />
              </label>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
          <div className="space-y-3">
            <div>
              <h2 className="text-sm font-semibold text-gray-900">Ambient sounds</h2>
              <p className="text-xs text-gray-500">Plays while the timer is running.</p>
            </div>
            <div className="space-y-3">
              {AMBIENT_SOUNDS.map((sound) => {
                const value = ambientVolumes[sound];
                return (
                  <div key={sound} className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs text-gray-600">
                      <span className="font-semibold text-gray-900">{AMBIENT_SOUND_LABELS[sound]}</span>
                      <span className="tabular-nums text-gray-500">{value}%</span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      step={1}
                      value={value}
                      onChange={(event) => handleAmbientChange(sound, Number(event.target.value))}
                      className="h-2 w-full cursor-pointer accent-gray-900"
                      aria-label={`${AMBIENT_SOUND_LABELS[sound]} volume`}
                    />
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};
