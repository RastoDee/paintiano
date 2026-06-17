# Paintiano — Transport Control System

Reference for the bottom transport/tool row. The row appears in every active
mode but its buttons differ per mode. This system keeps it consistent.

## Three zones (fixed order, left → right)

1. **PRIMARY** — Play / Pause / Resume. Always first (left). The only green
   button, tallest (44px). The anchor; the eye lands here first. Never moves.
2. **CONTEXT** — the mode's own buttons (middle). Changes per mode:
   Next, Show, Atmosphere, REC/Save, Orig⇄Piano, Loop, Restart, Mic-stop, Scale.
3. **UTILITY** — Mute · Speed · Clear (right). Present across (almost) every
   mode, always in this order → muscle memory. Clear is always last.

## Tokens (colour = meaning, never decoration)

| Token | Colour | Used by |
|-------|--------|---------|
| `primary`  | green (`#5fd99a→#37a96b`) | Play / Pause / Resume |
| `neutral`  | gold glass (muted)       | Mute, Speed=1×, Scale-idle |
| `active`   | gold filled              | toggled-ON neutral: Loop, Show, Speed≠1× |
| `pink`     | `#ff7a9c`                | navigation between paintings: Next, Restart |
| `blue`     | `#9bc0ff`                | audio source toggle: Orig⇄Piano only |
| `ai`       | violet (`#c4b0ff`)       | Atmosphere — ALWAYS violet (AI feature). idle = muted, ON = full |
| `save`     | gold `#ffd07a` filled    | Save — ALWAYS this token wherever Save appears |
| `danger`   | red (`#e8857a`)          | REC, Mic-stop, Mute-ON, Clear-arm ("tap again") |
| `ghost`    | gold, transparent        | Clear idle (lowest weight) |

## Uniform geometry
- Height 40px (PRIMARY 44px). Radius 20px. One consistent pill family.
- Icons: **lucide-style strokes, no emoji** (mute = speaker+waves / muted = speaker+x,
  rec = circle, restart = reload-arrow, next = arrow-right, save = upload-arrow,
  loop = repeat, atmosphere = sparkle, scale = music-notes, orig = music-notes).
- Label = one word (Pause, Next, Save, Loop, Atmosphere, Rec, Clear). Utility
  icons (mute, speed) are icon-only. Speed shows its rate (1×/½×/2×).

## Per-mode composition

| Mode | PRIMARY | CONTEXT | UTILITY |
|------|---------|---------|---------|
| Compose | Play/Pause | Scale (if advanced) | Mute · Speed · Clear |
| Mic — live | Play/Pause | Mic-stop (danger) | Mute · Clear |
| Mic — done (blob) | Play | Restart (pink) · Orig⇄Piano (blue) | Mute · Speed · Clear |
| Mood | Play/Pause | Loop (active when on) | Mute · Speed · Clear |
| Image — Scan | Play/Pause | Atmosphere (ai) · REC (danger) | Mute · Speed · Clear |
| Image — AI Compose | Play/Pause | Atmosphere (ai, on=full) · REC→Save | Mute · Speed · Clear |
| Canvas + Dice (playing) | Play/Pause | Next (pink) · Show (active) | Mute · Speed · Clear |
| Canvas — idle (done) | Play | Next (pink) · Save (save) | Mute · Speed · Clear |

## Invariants
- PRIMARY left + UTILITY right never move; only CONTEXT changes between modes.
- Atmosphere is violet everywhere (it's AI). Save is gold everywhere.
- Blue is reserved strictly for the audio-source toggle.
- Disabled = same token at ~40% opacity, no colour change.
