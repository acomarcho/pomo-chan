# How the Live2D model and mouth lip-sync work in this app

## Plain-English summary

This app shows a Live2D character by loading a Cubism model from `public/live2d`, rendering it with PixiJS, and mounting the Pixi canvas inside the timer screen.

The mouth sync is not using phoneme detection or speech-to-text.
It is much simpler than that:

1. The timer logic plays a normal `HTMLAudioElement`.
2. The UI passes that same audio element to the Live2D stage.
3. The stage routes the audio through a Web Audio `AnalyserNode`.
4. Each frame, it measures how "loud" the waveform currently is.
5. It writes that loudness into the model's lip-sync parameter, which is `ParamMouthOpenY` for the current Hiyori model.

If you remember one sentence from this note, remember this one:

> We do real-time volume-based mouth opening on top of a normal audio element that the timer already owns.

## Terms first

### Live2D

**Live2D** is the character system. It uses model files, textures, and parameter values to animate a 2D character.

In this repo, the model files live under `public/live2d/hiyori/`.

### Cubism

**Cubism** is Live2D's SDK/runtime family.

Our model is a Cubism 4 style model, which is why the app loads the Cubism runtime scripts in [`index.html`](../index.html).

### PixiJS

**PixiJS** is the rendering library that draws the model onto a canvas.

### `pixi-live2d-display`

`pixi-live2d-display` is the bridge between PixiJS and Live2D.
It knows how to load `.model3.json` files and turn them into something Pixi can render.

### Parameter

A **parameter** is a named numeric control inside the Live2D model.

Example:

- `ParamMouthOpenY` controls mouth open/close for this model.

Changing a parameter value changes the character's face or body.

### Lip-sync parameter group

A **lip-sync parameter group** is metadata inside `.model3.json` that says which model parameters should be treated as "mouth sync" targets.

In this repo's model, the group is:

- `Name: "LipSync"`
- `Ids: ["ParamMouthOpenY"]`

You can see that in [`public/live2d/hiyori/hiyori_pro_t11.model3.json`](../public/live2d/hiyori/hiyori_pro_t11.model3.json).

### `HTMLAudioElement`

This is the browser's normal audio object created by `new Audio(...)`.

The timer system already uses these for:

- focus start voice
- focus end voice
- break start voice
- break end voice
- reminder voice
- tick/tock
- ambient loops

### Web Audio API

The **Web Audio API** is a lower-level browser audio system.

We use it for analysis, not for choosing which sound to play.
The app creates:

- an `AudioContext`
- a `MediaElementAudioSourceNode`
- an `AnalyserNode`

That lets us inspect the waveform of a playing `HTMLAudioElement`.

## Where the model lives

The current model is stored in the repo, not fetched from an external service.

Relevant files:

- [`public/live2d/hiyori/hiyori_pro_t11.model3.json`](../public/live2d/hiyori/hiyori_pro_t11.model3.json)
- [`public/live2d/hiyori/hiyori_pro_t11.moc3`](../public/live2d/hiyori/hiyori_pro_t11.moc3)
- [`public/live2d/hiyori/hiyori_pro_t11.2048/texture_00.png`](../public/live2d/hiyori/hiyori_pro_t11.2048/texture_00.png)
- [`public/live2d/hiyori/hiyori_pro_t11.2048/texture_01.png`](../public/live2d/hiyori/hiyori_pro_t11.2048/texture_01.png)
- [`public/live2d/hiyori/motion/hiyori_m01.motion3.json`](../public/live2d/hiyori/motion/hiyori_m01.motion3.json)

The important point is that Vite serves the `public/` directory as static files, so the renderer can load the model by URL.

The timer screen hard-codes the model URL here:

- [`src/components/TimerWindow.tsx`](../src/components/TimerWindow.tsx)

```ts
const LIVE2D_MODEL_URL = `${import.meta.env.BASE_URL}live2d/hiyori/hiyori_pro_t11.model3.json`;
```

## What has to be loaded before the model can render

There are three setup pieces that matter.

### 1. Pixi must be exposed on `window`

`pixi-live2d-display` expects `window.PIXI` to exist in this setup.

That happens near the top of [`src/components/TimerWindow.tsx`](../src/components/TimerWindow.tsx):

```ts
(window as typeof window & { PIXI?: typeof PIXI }).PIXI = PIXI;
```

### 2. Cubism runtime scripts must be present in the page

The app loads the Cubism runtime scripts in [`index.html`](../index.html):

```html
<script src="%BASE_URL%live2d/cubism/cubism2.min.js"></script>
<script src="%BASE_URL%live2d/cubism/cubism4.min.js"></script>
```

This is required because the Live2D plugin needs the Cubism runtime loaded globally before it can build the model.

### 3. The React screen creates a Pixi application and canvas

Inside `Live2DStage`, the app creates a `PIXI.Application`, grabs its canvas, and appends that canvas into a normal React-owned `div`.

That happens in [`src/components/TimerWindow.tsx`](../src/components/TimerWindow.tsx).

This is the "mounting" step.
React owns the container `div`, and Pixi owns the drawing inside it.

## The render flow for the Live2D model

This is the current runtime flow.

1. `TimerWindow` renders `Live2DStage`.
2. `Live2DStage` creates a Pixi app in a `useEffect`.
3. It calls `Live2DModel.from(LIVE2D_MODEL_URL, ...)`.
4. When the model loads, it adds the model to the Pixi stage.
5. It measures the model bounds.
6. It scales and positions the model to fit the timer panel.
7. On resize, it recalculates that fit.

The core code is in [`src/components/TimerWindow.tsx`](../src/components/TimerWindow.tsx).

Important implementation details:

- `autoInteract: true` is enabled, so the model still supports built-in interaction behavior from the plugin.
- `idleMotionGroup: "__none__"` disables automatic idle motions.

That second point matters.
Without it, the model could keep playing idle animations even when we want the screen to feel visually quiet and controlled.

## How the app discovers which mouth parameter to drive

The app starts with a safe fallback:

```ts
const lipSyncIdsRef = useRef<string[]>(["ParamMouthOpenY"]);
```

Then, after loading, it fetches the `.model3.json` file and reads the `Groups` section to find the official `LipSync` group.

That happens in [`src/components/TimerWindow.tsx`](../src/components/TimerWindow.tsx).

For the current Hiyori model, the file contains:

```json
"Groups": [
  {
    "Target": "Parameter",
    "Name": "LipSync",
    "Ids": ["ParamMouthOpenY"]
  }
]
```

Why this is useful:

- it keeps the code compatible with the model's own metadata
- it avoids hard-coding more than necessary
- it would still work if a future model declared more than one lip-sync parameter

## Where the audio comes from

The Live2D stage does not create the voice audio itself.

The timer hook owns that.

The main audio creation happens in [`src/lib/hooks/timer-hooks.ts`](../src/lib/hooks/timer-hooks.ts):

- `buildAudioMap(...)` creates start/end voice clips
- `createReminderAudio(...)` creates the reminder clip
- `createTickTockAudio(...)` creates the ticking sounds
- `createAmbientAudioMap(...)` creates ambient loops

When the timer wants to play a voice clip, it does this:

```ts
audio.currentTime = 0;
onVoiceAudioPlayRef.current?.(audio);
void audio.play();
```

That happens in both `playSound(...)` and `playReminder(...)` in [`src/lib/hooks/timer-hooks.ts`](../src/lib/hooks/timer-hooks.ts).

Then `TimerWindow` receives that callback and stores the audio element as a signal:

```ts
const handleVoiceAudioPlay = useCallback((audio: HTMLAudioElement) => {
  setVoiceAudioSignal({ audio, token: Date.now() });
}, []);
```

That signal is passed down to `Live2DStage`.

## The mouth-sync flow end to end

This is the full current flow.

1. `usePomodoroTimer` decides to play a voice clip.
2. It calls `onVoiceAudioPlay(audio)` before starting playback.
3. `TimerWindow` stores `{ audio, token }` in React state.
4. `Live2DStage` sees the new token in an effect.
5. `Live2DStage` calls `setupVoiceAudio(audio)`.
6. `setupVoiceAudio(...)` connects that audio element to a shared `AudioContext` and `AnalyserNode`.
7. Play/pause/ended listeners update `activeAudioRef`.
8. On each frame, `updateLipSync()` samples the analyser waveform.
9. It converts the waveform into a loudness number.
10. It smooths that number.
11. It writes the result into each lip-sync parameter ID on the model.

This split is intentional:

- the timer owns "which sound should play"
- the Live2D stage owns "how should the model react to the currently playing voice audio"

## How `setupVoiceAudio(...)` works

`setupVoiceAudio(...)` lives in [`src/components/TimerWindow.tsx`](../src/components/TimerWindow.tsx).

It does a few important things:

### It creates one shared audio analysis pipeline

The stage lazily creates:

- one `AudioContext`
- one `AnalyserNode`
- one waveform buffer

This is good because we do not need a new analyser for every clip.

### It creates one media source node per audio element

The code stores source nodes in this map:

```ts
const audioSourcesRef = useRef(new Map<HTMLAudioElement, MediaElementAudioSourceNode>());
```

That prevents reconnecting the same `HTMLAudioElement` repeatedly.

### It keeps track of the currently active voice audio

The code adds `play`, `pause`, and `ended` listeners so `activeAudioRef` always points at the clip that should currently drive the mouth.

That means the analyser pipeline may know about multiple audio elements over time, but only one active element is allowed to control the mouth at a given moment.

## How `updateLipSync()` turns sound into mouth movement

This is the most important part of the feature.

### Step 1: read the waveform

The code calls:

```ts
analyser.getByteTimeDomainData(buffer);
```

That fills the byte array with the current time-domain waveform.

### Step 2: calculate signal energy

The code then normalizes each sample around zero:

```ts
const normalized = (buffer[i] - 128) / 128;
```

Then it squares and averages those values, and finally takes the square root.

That final number is **RMS**.

**RMS** means **root mean square**.
In plain English, it is a common way to estimate how strong or loud a signal is over a short time window.

### Step 3: scale and clamp it

The code multiplies the RMS value by `LIP_SYNC_GAIN`, then clamps it to `0..1`.

```ts
target = Math.min(1, rms * LIP_SYNC_GAIN);
```

It also applies a silence threshold:

```ts
if (target < LIP_SYNC_SILENCE_THRESHOLD) {
  target = 0;
}
```

That avoids tiny background noise causing constant mouth flutter.

### Step 4: smooth the motion

The code does not jump straight to the new value.
It blends toward it.

There are separate constants for opening and closing:

- `LIP_SYNC_ATTACK = 0.6`
- `LIP_SYNC_RELEASE = 0.3`

That means:

- the mouth opens faster than it closes
- the result looks less jittery

### Step 5: write into the model parameter

Finally, the code writes the value into each lip-sync parameter ID:

```ts
coreModel.setParameterValueById(id, value);
```

There is also a fallback to `setParamFloat(...)`, which helps across slightly different internal model APIs.

## Why we hook after motion updates

When the model becomes ready, the code tries to subscribe to:

- `afterMotionUpdate`

That is a useful detail.
It means the mouth value is written after the model's motion system has done its own parameter updates for that frame.

Why that matters:

- if motion code and our lip-sync code both write to the same parameter, the one that runs last wins
- writing after motion updates reduces the chance that motion playback immediately overwrites our mouth value

If that internal event is not available, the code falls back to the Pixi ticker and still updates every frame.

## Why built-in plugin lip-sync is turned off

After the model is ready, the code does this:

```ts
(internalModel as { lipSync?: boolean }).lipSync = false;
```

That tells the model internals not to run a separate built-in lip-sync path.

The likely reason is control.
We already have our own analyser-driven value, our own smoothing, and our own threshold.
Leaving another lip-sync system enabled would risk conflicting parameter writes.

This is an inference from the implementation, not a direct comment in the code, but it matches the current behavior.

## What sounds actually move the mouth today

This is an important repo-specific finding.

The mouth only follows audio passed through `onVoiceAudioPlay(...)`.

Right now that means:

- focus start voice
- focus end voice
- break start voice
- break end voice
- reminder voice

It does **not** appear to include:

- tick/tock
- ambient rain/fire/forest loops

Why:

- `playSound(...)` calls `onVoiceAudioPlayRef.current?.(audio)`
- `playReminder(...)` does the same
- the tick/tock path does not
- the ambient audio path does not

That is why the character mouths the spoken prompts but does not chatter on every timer tick or ambient loop.

## What this solves well

- It reuses the exact audio element the app already plays.
- It does not need speech recognition.
- It works in real time while audio is playing.
- It respects the model's declared lip-sync parameter group when available.
- It keeps the timer code and rendering code separated cleanly.

## What this does not solve

This implementation is intentionally simple.

It does not do:

- phoneme-aware lip-sync such as A/I/U/E/O mouth shapes
- microphone input lip-sync
- per-language mouth shapes
- blending mouth form and mouth open separately
- multi-audio mixing

It is volume-based only.
If the clip gets louder, the mouth opens more.
If the clip gets quieter, the mouth closes.

## Current caveats and design constraints

### Only one active audio clip drives the mouth

`activeAudioRef` stores a single audio element.
If multiple tracked clips overlap, the one that most recently becomes active wins.

That is probably acceptable for this app because the spoken clips are short and usually not stacked.

### The current model assumes a standard mouth-open parameter

The fallback is `ParamMouthOpenY`.
That is standard and correct for this model, but a future model may need different or additional IDs.

### The animation is based on loudness, not pronunciation

This means it looks believable for short prompts, but it will never be true lip articulation.

### The code fetches the model JSON separately to read the `Groups`

That is fine for now, but it means the app loads the same JSON once for the plugin and once again for custom metadata inspection.

## File map for this feature

If you need to change this later, start with these files:

- [`src/components/TimerWindow.tsx`](../src/components/TimerWindow.tsx)
  The Live2D stage, Pixi setup, analyser setup, and lip-sync writes all live here.
- [`src/lib/hooks/timer-hooks.ts`](../src/lib/hooks/timer-hooks.ts)
  The timer-owned audio elements are created and played here.
- [`public/live2d/hiyori/hiyori_pro_t11.model3.json`](../public/live2d/hiyori/hiyori_pro_t11.model3.json)
  The model metadata defines the `LipSync` parameter group.
- [`index.html`](../index.html)
  The Cubism runtime scripts are loaded here.
- [`package.json`](../package.json)
  Confirms the project uses `pixi-live2d-display` and PixiJS.

## Decision rule for future changes

Use this rule when modifying the feature:

1. If you are changing which audio should move the mouth, start in [`src/lib/hooks/timer-hooks.ts`](../src/lib/hooks/timer-hooks.ts).
2. If you are changing how the mouth moves, start in [`src/components/TimerWindow.tsx`](../src/components/TimerWindow.tsx).
3. If you are changing which parameter gets driven, check the target model's `.model3.json` `Groups` section first.
4. If you want realistic speech shapes instead of simple mouth opening, this implementation is the wrong layer to extend casually. You would need a different lip-sync strategy, not just different constants.

## Suggested reading order

1. [`src/lib/hooks/timer-hooks.ts`](../src/lib/hooks/timer-hooks.ts)
   Understand where the audio elements come from.
2. [`src/components/TimerWindow.tsx`](../src/components/TimerWindow.tsx)
   Understand how the stage receives audio and drives the model.
3. [`public/live2d/hiyori/hiyori_pro_t11.model3.json`](../public/live2d/hiyori/hiyori_pro_t11.model3.json)
   Confirm the model's lip-sync parameter group.
4. MDN: `AudioContext.createMediaElementSource()`
   https://developer.mozilla.org/en-US/docs/Web/API/AudioContext/createMediaElementSource
5. MDN: `AnalyserNode.getByteTimeDomainData()`
   https://developer.mozilla.org/en-US/docs/Web/API/AnalyserNode/getByteTimeDomainData
6. `pixi-live2d-display` README
   https://github.com/guansss/pixi-live2d-display
7. `pixi-live2d-display` complete guide
   https://github.com/guansss/pixi-live2d-display/wiki/Complete-Guide
8. Live2D Cubism SDK manual: lip-sync
   https://docs.live2d.com/en/cubism-sdk-manual/lipsync/
9. Live2D standard parameter list
   https://docs.live2d.com/en/cubism-editor-manual/standard-parameter-list/

## Final takeaway

The model is not "speaking" because Live2D magically understands the audio.

It speaks because this app does four explicit things:

1. load the model correctly
2. play voice audio through normal browser audio elements
3. measure the audio waveform in real time
4. write that measured loudness into the model's mouth-open parameter every frame

That is the whole system.
It is small, understandable, and good enough for short spoken prompts.
