# pi-extensions

A collection of [pi](https://github.com/badlogic/pi-mono) agent extensions by EarthChen.

Each extension lives under `extensions/<name>/` with its own `README.md`. New extensions
are added by dropping a `extensions/<name>.ts` file and appending its path to the
`pi.extensions` array in `package.json`.

## Extensions

| Extension | Description |
|-----------|-------------|
| `proactive-compact` | Agent-judged + occupancy-threshold proactive context compaction. See [extensions/proactive-compact/README.md](extensions/proactive-compact/README.md). |

## Install

```bash
pi install npm:@earthchen/pi-extensions
# or, from this repo:
pi install git:github.com/EarthChen/pi-extensions
```

pi auto-loads extensions from `~/.pi/agent/npm/`; restart pi (or `/reload`) to apply.

> If you previously kept a local copy at `~/.pi/agent/extensions/proactive-compact.ts`,
> delete it after installing this package to avoid the extension being loaded twice.

## Adding another extension

1. Create `extensions/<name>.ts` (default-export an `ExtensionAPI` registration function).
2. Create `extensions/<name>/README.md`.
3. Append `"./extensions/<name>.ts"` to `pi.extensions` in `package.json`.
4. Bump `version` and `pnpm publish`.
