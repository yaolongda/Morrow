# Morrow · 朝暮

![Windows 10/11](https://img.shields.io/badge/platform-Windows%2010%20%2F%2011-0078D6)
![Electron 45](https://img.shields.io/badge/Electron-45-47848F)
![License MIT](https://img.shields.io/badge/license-MIT-2EA44F)
[![Download](https://img.shields.io/badge/download-latest-FF3B30)](../../releases/latest)

> *Morrow* — the next day, the morning light.

**Morrow (朝暮)** is a macOS-inspired desktop calendar for Windows with four views, flexible recurring events, customizable work/rest rhythms and shift hours, long-running project plans, Chinese statutory holidays, four desktop widgets, and a full settings center. Local-first, built with Electron and vanilla JavaScript.

[中文](README.md) · [Offline HTML manual](README.html) · [GitHub](https://github.com/yaolongda/Morrow)

![Month view](docs/month.png)

## Download

Get the latest Windows installer from **[Releases](../../releases/latest)**:

```text
朝暮-Morrow-Setup-1.1.0.exe
```

- Windows 10 / 11, x64
- Per-user install; no administrator privileges required
- Desktop and Start Menu shortcuts are created automatically
- Uninstall from Windows Settings; calendar data is preserved
- Unsigned build — if SmartScreen appears, choose **More info → Run anyway**

## Highlights

### Calendar

- Month, week, day and year views; all-day, multi-day and cross-month events.
- Drag a time range to create an event; double-click a month date for a quick event.
- Multiple color-coded calendars, show/hide, right-click rename/delete.
- Instant search across titles, locations and notes.
- Local-first JSON persistence with atomic writes.

### Recurring events

- Seven presets: **daily, every weekday, weekly (pick any days), every two weeks, monthly, quarterly, yearly**.
- Optional repeat end date; leave it empty to repeat indefinitely.
- When editing a recurring event, choose **This event** or **All events**: the former changes or deletes only one occurrence, the latter updates the whole series (changing the date shifts the series).
- Occurrences expand automatically in every view and in all four desktop widgets, marked with ↻.
- Search jumps to the next upcoming occurrence instead of the series' first date.

### Shift hours and off-work celebrations

- Set the shift in **Settings → Work schedule**: **morning + afternoon**, **all day**, or **night shift**, with exact start/end times.
- The Today widget shows a live countdown to work, lunch, and the end of the day; on rest days it simply says "rest well".
- Lunch break gets a small, quiet celebration. Finishing work gets a fuller particle animation and a short poem.
- If tomorrow is a weekend or statutory holiday, the last workday celebration is upgraded automatically.
- Night shifts cross midnight; the celebration happens when the shift ends in the morning.
- Celebrations live only inside the Today widget — no system notifications, no interruptions.

![Shift hours](docs/settings-work-hours.png)

### Chinese statutory holidays

- Bundled 2024–2026 holiday and make-up workday arrangements: holidays automatically become rest days, make-up days become workdays.
- Holiday names appear in the month view; the settings calendar marks them with a dot.
- Special-date overrides win: click a holiday and set it to "work" when you have to work through it.
- Holiday syncing can be turned off in Settings → Work schedule.

### Work rhythm

- Choose the week start: **Monday / Sunday / Saturday**.
- Rest-day presets: double day off, single day off, alternating big/small weeks, 3-on/1-off, Saturday half-day, Saturday half-day with alternating weekends, five days off per month (custom), or fully custom weekdays.
- Override any date as rest, half-day or work, for holidays and make-up days.
- Rest days are softly highlighted across every calendar view, the mini calendar and all desktop widgets, and stay in sync.

![Work schedule](docs/settings-work.png)

### Long-running plans

- Plans have a start and end date and a progress value.
- Automatically classified and styled as **short (cross-week)**, **medium (cross-month)** or **long (cross-year)**.
- Subtle progress ribbons appear across the month; a dedicated plan band appears in week/day views.
- **Time-based progress**: new plans advance automatically with the calendar; switch it off to update progress by hand.
- **Custom reminder nodes**: add dates such as "first milestone review"; on the day, a gentle card with a poem appears — no system notification.
- Crossing **20 / 50 / 75 / 80 / 90 / 100%** triggers a short classical Chinese poem of encouragement.
- Gentle deadline reminders and an active-plan list (with today's node) in the sidebar.

![Plan editor](docs/plan-editor.png)

### Desktop widgets

Month, Today, Upcoming, and Month & Agenda.

- Drag to move; **no fixed small/medium/large presets** — resize freely from the bottom-right grip or window edges.
- Layout adapts to size: month and agenda sit side by side when wide, stack when narrow; type scale and visible rows follow.
- Widgets follow the global theme, accent, font, panel opacity, blur, and background image, with subtle entrance animations.
- **Lock position and size** when done; pin above other windows or close. State survives restarts.
- The Today widget shows lunar date, solar term, work countdown, and plays an off-work celebration.
- Click a date or event to open it in the main calendar.

![Off-work celebration](docs/widget-celebration.png)

![Desktop widgets](docs/widgets-showcase.png)

### Settings center

Open with the gear button or `Ctrl + ,`.

- **General**: week start, sidebar, config export/import, data folder.
- **Work schedule**: rest presets, custom weekdays, shift hours, statutory holiday sync, special-date overrides and overtime.
- **Appearance**: three themes, accent color, six font choices, Windows 11 Mica/Acrylic, panel opacity, glass blur, and a custom background image with opacity/blur/dim controls.
- **Display**: lunar date, 24 solar terms, almanac auspicious/inauspicious activities, zodiac fortune, plan visibility.
- **Plans**: plan types, active plans, create new.
- **About**: version, slogan, project homepage, update link.

![Appearance](docs/settings-appearance.png)

## Shortcuts

| Shortcut | Action |
| --- | --- |
| `T` | Today |
| `D` / `W` / `M` / `Y` | Day / Week / Month / Year view |
| `←` / `→` | Previous / next range |
| `Ctrl + N` | New event |
| `P` | New plan |
| `Ctrl + F` or `/` | Search |
| `Ctrl + ,` | Settings |
| `Ctrl + Enter` | Save event / plan |
| `Esc` | Close dialog / search |

## Build from source

```powershell
npm install
npm start
```

Optional mirror for slow Electron downloads:

```powershell
$env:ELECTRON_MIRROR = "https://npmmirror.com/mirrors/electron/"
$env:ELECTRON_BUILDER_BINARIES_MIRROR = "https://npmmirror.com/mirrors/electron-builder-binaries/"
npm install
```

Build:

```powershell
npm run dist
# dist\朝暮-Morrow-Setup-1.1.0.exe

npm run build:portable
# release\朝暮-win32-x64\朝暮.exe
```

## Data

```text
%APPDATA%\朝暮\
├─ calendar-data.json    # calendars, events, plans and settings
├─ widgets.json          # widget position, size, pin and lock
└─ window-state.json     # main window bounds
```

No network access, no telemetry. Uninstalling preserves the data directory.

## Tech

- Electron 45
- Vanilla HTML/CSS/JavaScript, no frontend framework, no runtime NPM dependencies
- Browser Intl Chinese calendar + solar-longitude solar terms
- Bundled Chinese statutory holiday data (chinese-days, MIT)
- Chromium DevTools Protocol end-to-end tests
- electron-builder + NSIS

## Tests

```powershell
npm test
npm run test:features
npm run test:widgets
```

59 automated checks: 23 core, 32 feature, 4 widget-restart. Coverage includes work/rest presets, statutory holidays, shift hours and celebration intensity, recurring event expansion and edit scope, plan auto-progress and reminder nodes, settings, widget free resize / theme / responsive layout / celebration animation, config import/export and restart persistence.

## Known limitations

- Almanac and zodiac content is generated locally for cultural/entertainment reference.
- Holiday data covers 2024–2026 (chinese-days, MIT); later years fall back to normal weekend rules and can be supplemented with special dates.
- Mica/Acrylic requires Windows 11.
- No sync, team sharing, system notifications or week numbers yet.
- Builds are unsigned.
- Widgets are separate windows and float above other apps when pinned.

## License

[MIT](LICENSE) © 2026 yaolongda

Inspired by Apple Calendar and macOS Sonoma widgets. Independent implementation, not affiliated with Apple.
