# Moon Flow pour-engine fix

This branch replaces the post-render color-orb effect with a true bottle pour sequence:

1. The valid destination click is intercepted before the existing game engine redraws the board.
2. The selected bottle is cloned into a fixed animation layer.
3. It lifts, travels to the destination, tilts, and produces a visible liquid stream with droplets.
4. The move is committed to the existing game engine while the pour is visible.
5. The bottle returns and the overlay is removed.

The original level generation, save data, audio, haptics, themes, and Codemagic configuration remain unchanged.

Validation: `smooth-v2.ts` passes TypeScript strict checking with ES2022 and DOM libraries.
