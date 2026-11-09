# Palette System

## Purpose

Provides shared recent colors and document brand colors to every editor color control.

## Owns

- Recent color history
- Brand color collection
- Recent color persistence

## Does NOT Own

- Node fills, strokes, text colors, or opacity
- Scene Graph mutations
- Color property inspector commands

## Public API

```ts
interface PaletteSystemAPI {
  hydrate(): void;
  recordColor(color: string): void;
  setBrandColors(colors: string[]): void;
}
```

## Depends On

- `palette.store`
- Browser local storage for recent-color persistence

## Folder

`src/assets/palettes/`

## State Ownership

Only Palette System methods write `palette.store`.

## Event Flow

Color picker commit -> Palette System -> recent colors store. Property changes continue through the Command System.

## Performance Notes

Palette updates occur only when a color is committed, never during transform frames.

## Known Pitfalls / Anti-Patterns

- Do not store node color values in the palette store.
- Do not dispatch Scene Graph commands from the Palette System.

## Extensibility

External brand kits and palette plugins can populate brand colors through `setBrandColors`.
