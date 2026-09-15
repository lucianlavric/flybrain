# Plan (pre-kickoff, ideas only — allowed by rules)

## Chosen direction: fly connectome plays piano (4-hour build)

Reservoir-computing cut — connectome frozen, no RL:

1. **Weights**: Shiu et al. preprocessed connectome weight matrix (skips Codex CSV wrangling). Signs from neurotransmitter predictions.
2. **Sim**: LIF spiking network, PyTorch. Mac has no CUDA — subsample to ~30k neurons dense (MPS-safe), or Colab GPU for full brain.
3. **I/O**: metronome pulse + previous note stimulate sensory neuron groups; population activity → ridge-regression readout → 12–88 keys → MIDI → Tone.js in browser.
4. **Demo**: browser page (this Next.js scaffold), brain-activity heatmap (2D canvas) beside piano roll. 3D neuron meshes = stretch only.

## Hour-by-hour

- **Hr 1**: weight matrix downloaded + sparse/dense tensor built
- **Hr 2**: LIF loop running, activity looks alive (not silent, not saturated)
- **Hr 3**: Python sim ↔ browser WebSocket bridge + piano UI
- **Hr 4**: collect stimulation runs, fit ridge readout on target MIDI, polish

## Known risks

- Fading memory → long songs drift. Fix: autoregressive note feedback + beat counter, keep song 16–32 bars.
- MPS sparse matmul weak → go dense-subsampled early, don't fight it.
- Honest framing: "connectome as reservoir computer", not "fly learned piano".

## Stretch (if time miraculously remains)

- Teacher-forced input ramp-down so connectome self-generates melody ("learned" tier)
- Sonify mushroom-body activity as ambient pad under melody
