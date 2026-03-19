# LiGiTiMiT

**Demonstration-based browser automation. Teach by doing. Replay exactly.**

No AI. No APIs. No scraping. Pure deterministic automation.

---

## What's Included

```
ligitimit/
├── ligitimit-extension/     # Chrome/Edge Extension (Manifest V3)
│   ├── manifest.json
│   ├── background.js
│   ├── content.js
│   ├── popup.html
│   ├── popup.js
│   ├── styles.css
│   └── icons/
│       ├── icon16.png
│       ├── icon32.png
│       ├── icon48.png
│       └── icon128.png
│
└── ligitimit-android/       # Android App (Galaxy S24 ready)
    ├── app/
    │   ├── build.gradle
    │   └── src/main/
    │       ├── AndroidManifest.xml
    │       ├── java/com/ligitimit/app/
    │       │   ├── MainActivity.kt
    │       │   ├── AutomationEngine.kt
    │       │   ├── MacroStorage.kt
    │       │   ├── MacroAdapter.kt
    │       │   ├── Models.kt
    │       │   └── Services.kt
    │       └── res/
    │           ├── layout/
    │           ├── drawable/
    │           └── values/
    ├── build.gradle
    ├── settings.gradle
    └── gradle.properties
```

---

## Chrome Extension Installation

### Method 1: Load Unpacked (Development)

1. Open Chrome/Edge
2. Navigate to `chrome://extensions` (or `edge://extensions`)
3. Enable **Developer mode** (toggle in top-right)
4. Click **Load unpacked**
5. Select the `ligitimit-extension` folder
6. The extension icon appears in your toolbar

### Method 2: Pack Extension (Distribution)

1. Go to `chrome://extensions`
2. Click **Pack extension**
3. Select the `ligitimit-extension` folder
4. This creates a `.crx` file for distribution

---

## Chrome Extension Usage

### Recording a Macro

1. Click the LiGiTiMiT extension icon
2. Enter a name (optional) and click **Start Recording**
3. Perform your actions on any website:
   - Click buttons and links
   - Type in input fields
   - Scroll pages
   - Navigate between pages
4. Click **Stop Recording** when done

### Running a Macro

1. Click the extension icon
2. Find your macro in the list
3. Click the **▶ Play** button
4. Watch as your actions are replayed automatically

### If a Step Fails

When an element can't be found:
- A dialog appears showing the failed step
- Choose: **Retry**, **Skip**, or **Stop**
- The extension highlights where it expected the element

### Import/Export

- **Export**: Click the 📤 icon next to any macro
- **Import**: Click "Import Macro" and select a `.json` file

---

## Android App Installation

### Prerequisites

- Android Studio Arctic Fox or newer
- Android SDK 34
- Galaxy S24 or any Android 8.0+ device

### Build Steps

1. Open Android Studio
2. Select **Open an existing project**
3. Choose the `ligitimit-android` folder
4. Wait for Gradle sync to complete
5. Connect your Galaxy S24 via USB (enable USB debugging)
6. Click **Run** ▶ or press `Shift + F10`

### APK Build

```bash
cd ligitimit-android
./gradlew assembleRelease
# APK location: app/build/outputs/apk/release/app-release.apk
```

---

## Android App Usage

### Recording

1. Open the app and navigate to any website
2. Tap **RECORD** at the bottom
3. Enter a macro name
4. Perform your actions in the browser
5. Tap **STOP** when finished

### Replaying

1. Tap **MACROS** to see saved macros
2. Tap the ▶ button on any macro
3. The app navigates and replays all steps

### Features

- Full browser with URL bar
- Desktop mode toggle
- Import/Export macros (via clipboard)
- Step-by-step replay with error handling

---

## Technical Details

### Supported Actions

| Action | Description |
|--------|-------------|
| Click | Mouse clicks with coordinate fallback |
| Input | Text field typing with character simulation |
| Scroll | Page and element scrolling |
| Navigate | URL changes |
| Select | Dropdown selections |
| Keydown | Special keys (Enter, Tab, etc.) |

### Selector Strategy

The extension tries multiple selector strategies in order:

1. **ID** - `#submit-btn`
2. **Data attributes** - `[data-testid="login"]`
3. **ARIA** - `[aria-label="Close"]`
4. **Classes** - `button.primary.large`
5. **nth-of-type** - `div > button:nth-of-type(2)`
6. **XPath** - As fallback
7. **Coordinates** - Final fallback

### Macro Format

```json
{
  "name": "Login to Dashboard",
  "createdAt": "2024-01-15T10:30:00Z",
  "startUrl": "https://example.com/login",
  "steps": [
    {
      "step": 1,
      "type": "click",
      "selector": "#email-input",
      "x": 421,
      "y": 302,
      "url": "https://example.com/login"
    },
    {
      "step": 2,
      "type": "input",
      "selector": "#email-input",
      "value": "user@example.com"
    }
  ]
}
```

---

## Security

- ✅ Runs only when user activates
- ✅ Only affects current tab
- ✅ No remote servers
- ✅ No data leaves browser
- ✅ All data stored locally

---

## Use Cases

- Automate Claude.ai conversations
- Automate ChatGPT workflows
- Fill repetitive forms
- Test website flows
- Automate Suno music generation
- Any browser-based workflow

---

## Troubleshooting

### Extension Not Recording

1. Refresh the page after installing
2. Check if the site allows extensions (some block them)
3. Try on a different website

### Replay Fails on Dynamic Sites

1. The site may have changed since recording
2. Try recording with slower actions
3. Use the Skip button to continue past failures

### Android WebView Issues

1. Clear app data in Settings
2. Check internet connection
3. Some sites block WebView user agents

---

## License

MIT License - Use freely for personal and commercial purposes.

---

**Built for the Lane 1 Family Chain workflow. 🎤✝️🤖**
