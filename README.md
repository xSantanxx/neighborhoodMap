# NYC Neighborhoods

A mobile app for exploring New York City neighborhood by neighborhood. Walk the city, discover new areas, track borough progress, and learn about each neighborhood from the map.

Built with [Expo SDK 54](https://docs.expo.dev/) and [React Native](https://reactnative.dev/).

## Features

- **Interactive map** — NYC neighborhood boundaries (2020 NTAs) overlaid on a styled map, bounded to the five boroughs.
- **Discovery tracking** — Visited neighborhoods are saved locally and highlighted in red; unvisited areas stay dimmed.
- **Borough progress** — Tap a neighborhood to see completion percentage for that borough (Brooklyn, Manhattan, Queens, Bronx, Staten Island).
- **Neighborhood details** — Tap the map to open a glass-style modal with the neighborhood name, borough, and a short description.
- **AI descriptions** — Descriptions are generated on demand via the [Groq API](https://groq.com/), with instant fallback copy from `neighborhoodInfo.ts` while the request loads or if the API is unavailable.
- **Location-aware visits** — Foreground GPS tracking detects when you enter a new neighborhood, sends a notification, and records the visit.
- **Background location** — Supported in development builds for tracking while the app is in the background (not available in Expo Go).

## Tech stack

| Layer | Tools |
| --- | --- |
| Framework | Expo 54, React Native 0.81, Expo Router |
| Maps | `react-native-maps`, GeoJSON overlays |
| Geospatial | `@turf/turf` (point-in-polygon checks) |
| Storage | `@react-native-async-storage/async-storage` |
| Location | `expo-location`, `expo-task-manager` |
| Notifications | `expo-notifications` |
| UI | `expo-blur`, custom map styling |
| AI | Groq Chat Completions API (`app/service.ts`) |

## Project structure

```
app/
├── app/
│   ├── index.tsx           # Main map screen and app logic
│   ├── service.ts          # Groq API client for neighborhood descriptions
│   ├── neighborhoodInfo.ts # Static fallback descriptions (262 neighborhoods)
│   └── _layout.tsx         # Expo Router root layout
├── neigh.json              # NYC NTA GeoJSON (neighborhood boundaries)
├── app.json                # Expo config, permissions, plugins
├── metro.config.js         # Metro bundler config
├── .env                    # API keys (not committed)
└── package.json
```

## Getting started

### Prerequisites

- Node.js 18+
- npm
- For iOS device builds: Xcode and an Apple ID
- For Android device builds: Android Studio

### Install

```bash
cd app
npm install
```

### Environment variables

Create a `.env` file in the `app/` directory:

```env
EXPO_PUBLIC_GROQ_API_KEY=your_groq_api_key_here
```

Get a key from the [Groq Console](https://console.groq.com/). Restart Metro after changing env vars:

```bash
npx expo start -c
```

### Run in Expo Go (quick testing)

Good for map UI and foreground location. Background location and full notification support are limited.

```bash
npx expo start
```

Scan the QR code with Expo Go on your phone, or press `i` / `a` for simulators.

### Run on a physical device (full features)

For background location and notifications, use a development build:

**iOS**

```bash
npx expo run:ios --device
```

Requires code signing in Xcode (Signing & Capabilities → your Team). Open `ios/app.xcworkspace` if you need to configure signing manually.

**Android**

```bash
npx expo run:android --device
```

Enable USB debugging on the device first.

After the first native build, start Metro with:

```bash
npx expo start --dev-client
```

## How it works

1. **Map tap** — Uses Turf.js to find which NTA polygon contains the tapped coordinate, then opens a detail modal.
2. **Description loading** — Shows static text from `neighborhoodInfo.ts` immediately, then replaces it with an AI-generated blurb when Groq responds. Results are cached in memory for repeat taps.
3. **GPS visits** — `watchPositionAsync` checks your coordinates against neighborhood polygons. New visits trigger a push notification and are appended to `@userprofile` in AsyncStorage.
4. **Progress** — Visited neighborhood names are compared against all NTAs in each borough to compute a completion percentage.

## Data

Neighborhood boundaries come from NYC **2020 Neighborhood Tabulation Areas (NTAs)**, bundled as `neigh.json`. Each feature includes properties such as `ntaname`, `boroname`, and `ntaabbrev`.

## Scripts

| Command | Description |
| --- | --- |
| `npm start` | Start Expo dev server |
| `npm run ios` | Build and run on iOS |
| `npm run android` | Build and run on Android |
| `npm run web` | Run in the browser |
| `npm run lint` | Run ESLint |

## Known limitations

- **Expo Go** — Background location and some notification behavior require a dev build.
- **iOS maps** — Google Maps on iOS needs extra native setup; the app uses platform-appropriate map providers.
- **Groq API** — Descriptions depend on network access and API availability; fallbacks are used when requests fail or time out.

## License

Private project.