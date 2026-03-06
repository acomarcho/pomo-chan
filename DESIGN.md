# pomo-chan Design System

## Core Philosophy: "Zine Neobrutalism"

The design language of pomo-chan is rooted in **Zine Neobrutalism**. It draws from independent publishing, risograph printing, old desktop utilities, and early web/editorial interfaces. It should feel raw, tactile, and opinionated while staying structured, legible, and pleasant to use for long sessions.

Unlike harsher neobrutalism, this version should not feel blinding or gimmicky. Prefer warm paper tones over pure white, restrained accent colors over rainbow noise, and crisp geometry over ornamental polish. The result should feel like a printed tool on a desk: bold, practical, and unmistakably human.

The visual language matters, but the product rules matter just as much: the interface should stay simple, task-first, desktop-native, and resilient under real content.

---

## 1. Product Principles

These principles override cleverness. When in doubt, follow these first.

### Task First

- Show what the user needs to do right now.
- Prefer one obvious primary action over several competing actions.
- Remove duplicate information, decorative chrome, and explanatory UI that does not help the current task.
- If a block explains the app more than it helps the user act, it probably should not exist.

### Human-Facing, Not System-Facing

- Never expose implementation details, internal state names, debug vocabulary, or backend concepts in the interface.
- Labels and copy should describe what the user can do, not how the app is built.
- Avoid status text that sounds like logs, ops language, or framework terminology.

### Desktop-Native, Resize-Safe

- Design for a desktop window first, not a phone screen stretched upward.
- The app must remain usable at the smallest supported window size and feel comfortable at larger sizes.
- More space should add clarity, not extra clutter.
- Secondary panels should collapse, reduce, or defer before the primary task surface becomes cramped.

### Overflow Resilience

- Long labels, timestamps, metadata, settings names, and mixed-language content must wrap or truncate intentionally.
- No important text should clip, overlap, or break the layout.
- Components should remain stable when real content is messier than mock content.

### Motion With Purpose

- Use animation when it improves orientation, continuity, hierarchy, or feedback.
- Motion should explain what is opening, closing, expanding, pressing, or returning.
- Avoid decorative animation that adds noise without improving usability.

### Interactivity Must Feel Interactive

- All interactive elements should communicate affordance clearly.
- Use visible hover states where hover exists.
- Use `cursor: pointer` on clickable elements.
- Feedback should feel immediate, physical, and obvious rather than overly subtle.

### Character Without Clutter

- The interface should have personality, but the product should still read as a tool.
- Use bold surfaces, strong hierarchy, and playful tension without turning every screen into a poster.
- Decorative elements should support the task, not compete with it.

---

## 2. Color Palette

The palette should stay intentionally limited, similar to spot-color printing.

| Role                             | Hex Code  | Description                                                                                                                          |
| :------------------------------- | :-------- | :----------------------------------------------------------------------------------------------------------------------------------- |
| **Paper (Background)**           | `#F4F1EA` | Warm off-white used for the app background and default surfaces. Softer than pure white and easier on the eyes during long sessions. |
| **Paper Hover**                  | `#EAE5D9` | Slightly darker paper tone for hover states and surface contrast.                                                                    |
| **Highlighter (Accent)**         | `#FF8C00` | Energetic orange used sparingly for primary actions, active states, and signature shadows.                                           |
| **Ink (Primary Text & Borders)** | `#000000` | High-contrast black for typography, icons, and borders.                                                                              |
| **Muted Ink (Secondary Text)**   | `#666666` | Secondary text tone for metadata, helper copy, and lower-priority information.                                                       |

### Palette Rules

- Keep the base palette small and memorable.
- Use accent colors with intention; they should signal emphasis, not fill every surface.
- Strong contrast matters more than subtle tonal sophistication.
- If additional colors are introduced, they should behave like printed spot colors, not gradient-heavy UI decoration.

---

## 3. Typography

Typography is the backbone of the aesthetic. The best pairings combine a characterful sans-serif for the main interface with a mechanical monospace for utility information.

### Primary Typeface

- Use a bold, distinctive sans-serif for headings, labels, buttons, and most body text.
- Favor geometric or editorial grotesk styles over neutral corporate UI fonts.
- Headers may use `uppercase` and tighter tracking when they benefit hierarchy, but readability wins over styling.
- Restrict the weight range so the interface feels deliberate rather than typographically noisy.

### Secondary Typeface

- Use a monospace face for timers, durations, metadata, keybinds, settings values, and technical-looking secondary information.
- The mono layer should help separate utility data from the main interface, not create visual clutter.
- Use it sparingly and consistently.

### Typography Rules

- Prioritize legibility over novelty.
- Avoid too many font sizes on a single screen.
- Use weight, casing, and spacing to establish hierarchy before introducing extra color.
- Numbers and time-based data should feel especially stable and easy to scan.

---

## 4. UI Components & Geometry

The geometry of the app is strictly orthogonal. There are no rounded corners, no glossy treatments, and no soft, floating primary surfaces.

### Borders

- **Width:** Uniform `2px` solid black (`#000000`).
- **Radius:** `0px`.
- **Usage:** Apply to most distinct surfaces and controls to create clear editorial boundaries.

### Shadows

- **Style:** Hard, unblurred drop shadows.
- **Offset:** `4px` down and `4px` right.
- **Color:** Accent orange (`#FF8C00`) by default.
- **Usage:** Use on key surfaces and controls to create the stacked-paper, pseudo-physical effect.

### Buttons

- **Resting State:** Accent or paper background, black border, hard shadow.
- **Active State:** The button should physically translate down and right while the shadow collapses.
- **Behavior:** Buttons should look unmistakably clickable and feel tactile immediately.

### Panels & Surfaces

- Use rectangular panels with clear borders and shadows for major content areas.
- Surfaces may lift slightly on hover, but motion should remain crisp and controlled.
- Hierarchy should come from size, position, border, and fill contrast before anything ornamental.

### Inputs

- Default to paper backgrounds with black borders.
- Focus states should be strong and obvious, ideally by adding the accent shadow or a similarly bold treatment.
- Do not rely on default browser styles alone.

### Toggles, Tabs, and Chips

- Selection states should be unmistakable at a glance.
- Active items may invert fills, gain shadows, or shift position slightly.
- These controls should feel like stamped labels or utility switches, not soft pills.

### Overlays

- Primary surfaces remain crisp and sharp.
- Overlays may use dimming and subtle blur to isolate a task, but blur is a focus tool, not the default visual language.
- Modals should feel like a strong sheet placed above the interface, not a weightless glass pane.

---

## 5. Layout & Spacing

- **Visible Structure:** Use borders, rails, and surface edges to define layout. Separation should be visible, not implied only by whitespace.
- **Primary Hierarchy:** Every screen should have one clearly dominant task surface.
- **Density:** Dense information is acceptable when spacing still preserves scanability.
- **Alignment:** Left alignment is preferred for most text, labels, and metadata to preserve the editorial feel.
- **Reduction:** If a screen feels crowded, remove or defer secondary UI before shrinking the primary task.
- **Consistency:** Repeating spacing rules is more important than chasing perfect visual centering in every isolated component.

---

## 6. Window & Responsive Rules

### Minimum Window First

- Design for the smallest supported desktop window size first.
- The core flow should remain fully usable in a compact window without hidden critical actions.
- Shorter viewport heights matter just as much as narrow widths in desktop apps.

### Larger Window Expansion

- Extra space may reveal supporting panels, history, analytics, companion surfaces, or richer contextual information.
- Larger layouts should feel calmer and roomier, not busier.
- Expanded layouts should not duplicate the same information in multiple places.

### Content Safety

- Use wrapping, truncation, minimum-width rules, and scroll regions intentionally.
- Never assume short labels, English-only content, or perfectly shaped numbers.
- Empty, loading, and error states should fit the same layout language as the rest of the app.

---

## 7. Interaction Design

- **Tactility:** Every important interaction should have a physical reaction. Buttons press. Panels reveal. Toggles snap. Active controls feel engaged.
- **Hover & Pointer:** Interactive elements should use visible hover feedback and appropriate pointer behavior.
- **Transitions:** Motion should be fast, snappy, and mechanical rather than floaty or luxurious.
- **Animated Structure:** Use animation to communicate layout changes such as sidebar reveals, collapsible sections, modal entrances, panel swaps, and state transitions.
- **State Clarity:** Hover, focus, active, selected, disabled, and loading states must all be visually distinct.
- **Safe Recovery:** For drag, press, or gesture-like interactions, the UI should provide a clear resting state and forgiving recovery when the action is not completed.

---

## 8. Copywriting Rules

- Copy should be short, direct, and action-oriented.
- Avoid redundant labels when layout and surrounding context already provide meaning.
- Avoid internal, system-facing, or developer-facing vocabulary.
- Avoid over-explaining mechanics that the interaction itself can teach.
- Prefer plain verbs such as `Start`, `Pause`, `Resume`, `Save`, and `Close` over abstract or clever wording.
- Status text should feel calm, useful, and human.

---

## 9. Screen Pattern: Focused Task Surface

The default screen pattern is a **focused task surface**, not a dashboard wall.

- Every view should have one obvious center of gravity.
- Supporting information should stay compact and easy to scan.
- Secondary panels, helper text, and decorative elements should remain subordinate to the main action.
- Personality should come through layout, motion, and surface treatment without overwhelming the user.
- If a screen starts feeling like a control room, simplify until the primary action becomes obvious again.
