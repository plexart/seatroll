# Seatroll (座签)

A mobile-first PWA that helps parent volunteers take attendance by seat when they are on duty
at school. It runs entirely in the browser and is hosted on GitHub Pages; class data is stored
in this repository as password-encrypted JSON.

Demo: open the site, pick **示例班级** and enter the password `demo`.

## Features

- **Classes** — `data/classes.json` lists the classes; each has its own encrypted data file
  and password. The chosen class and its password are remembered in the browser; tap the class
  name in the top bar to switch.
- **Check-in** — shows the current time and the session it falls in, then draws the expected
  seat chart: the chart in effect at that session, with students on leave greyed out. Tap a
  seat to mark an expected student absent, or a student on leave as present after all. The
  date and slot can be changed to look at or fill in another session. Copy a text summary for
  the group chat, save an image, or export the check-in.
- **Two views** — _podium view_ (default) is what a volunteer standing at the podium sees:
  podium at the bottom, row 1 next to it, columns 8→1 from left to right. _Seat view_ is what a
  student sitting down sees: podium on top, columns 1→8.
- **Seat charts** — each chart has an effective time; the latest one in effect is used. The
  editor can shift everyone forward/back one row or left/right one column (wrapping around;
  seats in the podium row are never moved), and place students by tapping: tap a student, then
  a seat. Seat to seat swaps; a student from the unseated tray takes the seat and the previous
  occupant goes back to the tray. The layout (rows, columns, podium column, cells without a
  desk, seats beside the podium) is editable. Charts can be saved as images.
- **Leave** — regular weeks have three sessions (Friday 18:30–22:00, Saturday 08:00–12:00,
  Saturday 14:00–16:45). The "specific date" mode uses the same three time slots on any date,
  for make-up lessons during holidays.
- **Reports** — one session's sheet, per-student statistics over a date range, and a leave
  overview; as text or images.
- **Import** — changeset files exported by other volunteers can be imported directly, so
  everyone sees the latest data before it is merged into the repository.
- **Installable PWA** that works offline.

## Data workflow

The site has no server, so changes travel as files:

1. Edits made in the app (students, seat charts, leave, check-ins) are kept in the browser
   and marked "未合并" (unmerged).
2. Export them (Settings → 全部导出, or the export button on each page). On phones the file
   goes to the share sheet, so it can be sent straight to a chat.
3. Other volunteers can import the file (Settings → 导入文件) to see the changes right away.
4. The maintainer merges the files into the encrypted data and publishes them:

   ```sh
   npm run merge -- ~/Downloads/seatroll-demo-*.json
   git add data && git commit -m "Update class data" && git push
   ```

   Records are merged by key (student id, chart id, date + slot); the newer `updatedAt` wins,
   so merging the same file twice is harmless. Once the published data contains a record,
   browsers drop their local copy of it automatically.

## Scripts

Requires Node 20+. Run `npm install` once.

| Command                              | Description                                                        |
| ------------------------------------ | ------------------------------------------------------------------ |
| `npm run new-class -- <id> <name>`   | Create a class: an empty encrypted file and a `classes.json` entry |
| `npm run merge -- <file.json> [...]` | Merge exported changesets into the encrypted data files            |
| `npm run decrypt -- <id>`            | Write the decrypted data to `private/<id>.json` (gitignored)       |
| `npm run passwd -- <id>`             | Re-encrypt a class with a new password                             |
| `npm run demo`                       | Regenerate the demo class from made-up names                       |
| `npm run icons`                      | Render the PNG icons from `icons/icon.svg`                         |
| `npm test`                           | Unit tests (`node --test`)                                         |
| `npm run format` / `format:check`    | Format / check the code with Prettier                              |
| `npm run serve`                      | Serve the app at http://localhost:8000                             |

Class passwords are kept in `.env` (gitignored), one line per class, so scripts never ask
twice:

```sh
PASSWORD_demo=demo
PASSWORD_class-7-3=some-long-password
```

A script asks for a missing password once and saves it there. See `.env.example`.

## Privacy and security

- The repository must never contain real student names in plain text. Real names only live
  inside the encrypted `data/*.enc.json` files; the demo class uses generated names.
- Encryption uses WebCrypto: PBKDF2-SHA256 (310,000 iterations) derives an AES-GCM-256 key from
  the class password. The same module (`js/crypto.js`) runs in the browser and in Node.
- Exported changeset files are **not** encrypted (they contain names). Share them only in
  trusted chats and do not commit them (`*.changeset.json` and `exports/` are gitignored).
- Class names in `data/classes.json` are public; keep them generic.
- The password is saved in the browser's `localStorage` so the app reopens without asking.
  Anyone with access to that browser can read it. Use "退出并忘记密码" in Settings on shared
  devices. Changing a password (`npm run passwd`) invalidates saved passwords.

## Deploying to GitHub Pages

1. Push the repository to GitHub.
2. In **Settings → Pages**, choose _Deploy from a branch_, branch `main`, folder `/ (root)`.
3. The app is served at `https://<user>.github.io/<repo>/`.

`.nojekyll` disables Jekyll processing. The service worker serves the app shell cache-first
(refreshing it in the background), and `data/` network-first, so merged data shows up on the
next load while the app keeps working offline. Bump `js/version.js` with each release, and
update the `ASSETS` list in `sw.js` when adding or removing app files (a test checks it).

## Project layout

```
index.html              app shell and tab bar
sw.js                   service worker
css/style.css           mobile-first styles (light/dark)
icons/                  app icons (icon.svg is the source)
locales/zh-CN.json      all UI text
locales/zh-CN.webmanifest
data/classes.json       class list (public)
data/<id>.enc.json      encrypted class data
js/app.js               entry point and hash router
js/crypto.js            encryption (browser + Node)
js/chart.js             seat chart model: shifts, placing, layout per view
js/sessions.js          time slots and session resolution
js/data.js              data model, merging, reports
js/store.js             open class, local overlay, import/export
js/render/              seat grid DOM and canvas images
js/views/               one module per page
scripts/                npm scripts
tests/                  node:test unit tests
```

## Data format

```js
{
  version: 1,
  slots: [{ id: 'fri-eve', weekday: 5, start: '18:30', end: '22:00' }, ...],
  students: [{ id, name, archived?, updatedAt }],
  seatCharts: [{
    id, effectiveFrom: 'YYYY-MM-DDTHH:mm', rows, cols,
    podium,                         // podium column (0 = students' leftmost)
    front: { '<col>': studentId },  // seats in the podium row
    seats: [[studentId | null]],    // row 0 = front row
    disabled: ['<row>:<col>'],      // cells without a desk
    deleted?, updatedAt,
  }],
  leaves: [{ date, slot, students: [{ id, note? }], updatedAt }],
  attendance: [{ date, slot, marks: { studentId: 'absent' | 'presentOnLeave' }, by?, updatedAt }],
}
```

A changeset file has the same collections (any subset) plus `type: "seatroll-changeset"` and
`classId`.

## Internationalization

UI text is never hard-coded: HTML uses `data-i18n` attributes and JS calls `t(key, params)`.
All strings live in `locales/zh-CN.json`; a test checks that every key used in the source
exists. To add a language, copy the locale file and its `.webmanifest` and translate them.
