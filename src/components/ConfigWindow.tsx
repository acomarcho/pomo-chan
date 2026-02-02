import React from "react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { useAppConfig } from "@/lib/hooks/app-hooks";

export const ConfigWindow = () => {
  const { config, updateConfig } = useAppConfig();

  return (
    <div className="min-h-screen bg-white px-4 py-5 text-gray-900">
      <header className="space-y-2 pb-4">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-gray-500">
          Preferences
        </p>
        <h1 className="text-2xl font-semibold">Pomodoro settings</h1>
        <p className="text-sm text-gray-500">
          Changes sync across the timer and this window.
        </p>
      </header>

      <section className="space-y-4">
        <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="text-sm font-semibold text-gray-900">
                Clock ticking
              </h2>
              <p className="text-xs text-gray-500">
                Play a soft tick while the timer runs.
              </p>
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
              <h2 className="text-sm font-semibold text-gray-900">
                Voice language
              </h2>
              <p className="text-xs text-gray-500">
                Start and end announcements.
              </p>
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
      </section>
    </div>
  );
};
