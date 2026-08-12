# opencode-beanie-plugin

An OpenCode plugin scaffold written in TypeScript.

## Development

Install dependencies and run the type check:

```sh
npm install
npm run check
```

Build the package with:

```sh
npm run build
```

## Use In OpenCode

Add the package to `opencode.json`:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": ["opencode-beanie-plugin"]
}
```

Add hooks to `src/index.ts` as the plugin grows.
