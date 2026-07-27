# Moonlight Mix — GitHub / Codemagic Edition

An original, cozy color-sorting puzzle designed for relaxing nighttime play. This is a production-minded MVP rather than a copied App Store game.

## Included now

- Guaranteed-solvable deterministic puzzle generation
- Endless level progression with increasing color count
- Daily challenge and best-move tracking
- Moon coin rewards and unlockable themes
- Undo, restart, and smart legal-move hints
- Local save data, streaks, stats, and settings
- Procedural sound effects and calm looping music (no licensed audio files)
- Native haptics, app lifecycle pause handling, and safe-area mobile layout
- Capacitor 7 configuration for iOS and Android
- Privacy policy
- Root-level `codemagic.yaml` that Codemagic can detect immediately

## Upload to GitHub

Delete the old files in your current repository, then upload **all contents of this folder**, including `src`, `public`, `docs`, and `codemagic.yaml`.

Do not upload the ZIP itself into the repository.

## Local development

```bash
npm install
npm run dev
```

## Test the production build

```bash
npm run build
```

## iOS CI

The included Codemagic workflow creates an unsigned iPhone simulator app first. This is the correct first milestone because Apple signing depends on your private developer credentials. After that workflow succeeds, follow `docs/CODEMAGIC_TESTFLIGHT.md`.

## Before App Store submission

- Confirm the final app/bundle name
- Create final 1024×1024 icon and splash assets
- Connect Apple signing and App Store Connect in Codemagic
- Add production AdMob/RevenueCat only after consent, privacy, and store products are configured
- Test puzzle generation, purchases, restoration, audio, and backgrounding on real iPhones
- Complete App Store privacy, age-rating, screenshots, support URL, and review notes

Contact used in the included privacy policy: davidwis616@gmail.com
