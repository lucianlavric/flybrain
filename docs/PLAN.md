# Plan (pre-event, ideas only — allowed by rules)

## Idea space (pick at kickoff)

1. **Connectome explorer** — 3D fly brain in browser, click neuron → see partners, pathways light up. Wow-factor demo, mostly frontend.
2. **"Ask the fly brain"** — natural-language queries over connectivity tables (LLM → SQL/dataframe over Codex CSV dumps). Judges love it, riskier.
3. **Pathway simulator** — stimulate sensory neurons, watch activation propagate through real connectivity. Hard science angle.

## Open decisions (settle Friday night)

- [ ] Which idea (or combo: explorer base + query layer stretch)
- [ ] Data prep: preprocess CSVs into JSON slices vs live fetch
- [ ] Do we need a Python backend at all, or pure frontend
- [ ] Team roles

## Kickoff checklist

- [ ] Download Codex connectivity dump + a starter set of neuron meshes
- [ ] Verify mesh format loads in three.js (neuroglancer precomputed → glTF/obj if needed)
- [ ] First commit of actual code AFTER hacking starts
