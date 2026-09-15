# flybrain

Hackathon project — the FlyWire fruit-fly connectome (~140k-neuron Drosophila brain map) as a frozen reservoir that plays piano.

## Status

Scaffolding + planning docs. Per event rules, custom code starts at kickoff — until then this repo contains **only generator boilerplate and planning docs**.

- `create-next-app` output (Next.js 15, TypeScript, Tailwind, App Router)
- three.js + @react-three/fiber + @react-three/drei installed for 3D neuron rendering

## Data sources (public)

- **FlyWire Codex** — https://codex.flywire.ai — browsable connectome, downloadable neuron/synapse tables
- **FlyWire downloads** — precomputed neuron meshes + connectivity CSVs (CC-BY)
- **navis / navis-flybrains** (Python) — if we need server-side neuron wrangling
- **Neuroglancer precomputed format** — meshes fetchable directly from the browser

## Dev

```bash
pnpm install
pnpm dev
```

## Planning

See `docs/PLAN.md`.
