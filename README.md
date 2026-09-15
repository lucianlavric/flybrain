# flybrain

Hack the North 2026 project — exploring the FlyWire fruit-fly connectome (the full ~140k-neuron Drosophila brain map).

## Status

Pre-event scaffolding only. Per HTN rules, this repo contains **only generator boilerplate and planning docs** — no custom code before kickoff.

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
