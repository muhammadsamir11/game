# Brick Racers — Figure Builder Design Spec

Date: 2026-10-15
Builds on: `2026-10-15-brick-racers-design.md` (the shipped game)

## Roadmap context

The user asked for three additions, built one at a time in this order:

1. **Figure builder** (this spec) — the child makes his own toy figure at the start.
2. **More parts** (next spec) — more figures and items to put on cars, including passenger seats for friend figures.
3. **Mini city** (later spec) — "My Garage" becomes a kid-friendly open city to drive around (no crime or violence) with a multi-storey parking garage for his cars.

## Purpose

Let the 8-year-old make a toy figure of himself the first time he plays, see that figure drive every car he builds, and make extra "friend" figures that a later sub-project lets ride along.

Success: on a fresh iPad, the game opens on the figure maker; he makes a figure and names it without help; from then on his figure sits in the driver's seat of his cars on the home turntable and in races, and the podium uses his name.

## Decisions (from the user)

- One main figure (him) plus optional extra "friend" figures.
- He chooses: head (hair, helmets and hats), face and skin tone, outfit colours and prints.
- No held or worn extras (cape, tools…) in this sub-project.

## Flow

- **First launch** (no saved main figure): open the figure maker instead of the home screen. After ✓ Done, ask "What's your name?" (max 24 characters, blank becomes "Me"), save, then show the home screen.
- **Home screen**: new button **👤 My Figures** opens the figures screen.
- **Figures screen**: shows the main figure (a picture, a name and a **Change** button) and a list of friend figures (picture, name, Change, 🗑 Delete with confirm), plus **＋ New friend** (opens the maker with a random starting figure). A 🏠 button goes back home. The main figure cannot be deleted.
- **Figure maker**:
  - Left: the figure, large, on a slowly spinning podium; one-finger drag turns it.
  - Right: five tabs of big picture tiles.
  - Bottom: **🎲 Surprise me** (random figure) and **✓ Done**.
  - Leaving with 🏠 discards changes after a confirm, except on first launch, which has no 🏠.
  - Every choice updates the 3D figure immediately and plays the pop sound.

## Choices

| Tab   | Options |
|-------|---------|
| Head  | none, spiky hair, long hair, ponytail, cap, racing helmet, cowboy hat, crown, astronaut helmet — plus a colour row: hair colours (black, brown, blonde, ginger, blue) for hair styles; the 8 game colours for hats and helmets (crown is always gold, astronaut is always white) |
| Face  | happy, big grin, cool sunglasses, silly tongue, determined, surprised |
| Skin  | classic toy yellow + 4 natural skin tones |
| Shirt | 8 game colours × print: plain, racing stripe, star, flame, police badge, lightning |
| Pants | 8 game colours |

## Data

`Figure = { id, name, head, headColor, face, skin, shirt, print, pants }`. All fields are catalogue keys. Saved in `localStorage` under `brickRacers.figures.v1` as `{ main: Figure | null, friends: Figure[] }`.

Invalid saved data:
- a field with an unknown key falls back to its default;
- a figure that isn't an object is dropped;
- unreadable JSON → no figures (first-launch flow runs again).

Never crash.

## Where the figure appears

- **Seat brick**: the driver is drawn as the main figure (replacing today's fixed blue-shirt, yellow-head driver) in the workshop, thumbnails, garage, showroom and race. Car thumbnails are re-made when the figure changes.
- **Home showroom**: the main figure stands on the turntable beside the newest car.
- **Races**: each AI car gets a fixed, deterministic random driver figure; the podium title uses the player's name ("You won, Sam! 🏆" / "You came 2nd, Sam!").

## Figure model

- Toy-figure proportions built from simple shapes:
  - legs on a hip block;
  - a slightly tapered torso;
  - angled arms with C-shaped hands;
  - a cylinder head with a stud on top;
  - headgear meshes on top of the head.
- Faces and shirt prints are drawn on canvas textures in code — no image files.
- The model is about 1 brick wide and ~4 bricks tall in grid units, so it fits the 2×2 seat. In the seat, the legs are bent (sitting pose).

## Code structure (new / changed)

```
js/figures.js        catalogue + defaults + normaliseFigure + randomFigure(seed)   (pure, tested)
js/figureStorage.js  load/save main + friends                                       (pure, tested)
js/figureMesh.js     Three.js model: createFigureMesh(figure, { pose: 'stand'|'sit' })
js/figureMaker.js    the maker screen (mode)
js/figuresScreen.js  the figures list screen
js/brickMesh.js      seat uses createFigureMesh(mainFigure, { pose: 'sit' })
js/showroom.js       figure beside the car
js/race.js           AI driver figures, podium uses the player's name
js/main.js           first-launch routing, My Figures button, figure accessor
```

## Testing

- **Automated (node:test):**
  - every catalogue default is valid;
  - `normaliseFigure` repairs unknown keys and missing fields;
  - `randomFigure(seed)` is deterministic and always valid;
  - storage round-trip, plus corrupt JSON and storage that throws;
  - name trimming and the default "Me";
  - friends can be added and deleted, but the main figure can't be deleted.
- **In the browser:**
  - first-launch flow on cleared storage;
  - every tile in every tab changes the 3D figure;
  - Surprise me;
  - the driver in the workshop, garage thumbnails, showroom and a race;
  - podium wording;
  - friends add/change/delete;
  - no console errors.

## Out of scope

Held or worn accessories, passengers (sub-project 2), city (sub-project 3), animation beyond the idle spin.
