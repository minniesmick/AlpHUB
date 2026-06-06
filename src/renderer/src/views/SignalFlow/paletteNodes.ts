import type { NodeCardData } from './nodes/NodeCard'

export interface PaletteItem {
  type:    'nodeCard'
  label:   string
  section: 'Source' | 'Effect' | 'Sink'
  data:    NodeCardData
}

export const PALETTE_ITEMS: PaletteItem[] = [
  // Sources
  { type: 'nodeCard', section: 'Source', label: 'ASIO In',   data: { label: 'ASIO In',   nodeType: 'source', hasInput: false } },
  { type: 'nodeCard', section: 'Source', label: 'Audio File', data: { label: 'Audio File', nodeType: 'source', hasInput: false, params: [{ label: 'File', value: '', type: 'text' as const }] } },

  // Effects — value is the initial real-unit value within [min, max]
  {
    type: 'nodeCard', section: 'Effect', label: 'Equalizer',
    data: {
      label: 'Equalizer', nodeType: 'effect',
      params: [
        { label: 'Low Shelf',  value: 0, min: -12, max: 12, unit: 'dB' },
        { label: 'Mid',        value: 0, min: -12, max: 12, unit: 'dB' },
        { label: 'High Shelf', value: 0, min: -12, max: 12, unit: 'dB' },
      ],
    },
  },
  {
    type: 'nodeCard', section: 'Effect', label: 'Compressor',
    data: {
      label: 'Compressor', nodeType: 'effect',
      params: [
        { label: 'Threshold', value: -18,  min: -60,  max: 0,    unit: 'dB' },
        { label: 'Ratio',     value: 4,    min: 1,    max: 20,   unit: ':1' },
        { label: 'Attack',    value: 5,    min: 0.1,  max: 200,  unit: 'ms' },
        { label: 'Release',   value: 100,  min: 10,   max: 1000, unit: 'ms' },
      ],
    },
  },
  {
    type: 'nodeCard', section: 'Effect', label: 'Reverb',
    data: {
      label: 'Reverb', nodeType: 'effect',
      params: [
        { label: 'Room Size', value: 0.5, min: 0, max: 1 },
        { label: 'Wet',       value: 0.3, min: 0, max: 1 },
      ],
    },
  },
  {
    type: 'nodeCard', section: 'Effect', label: 'Delay',
    data: {
      label: 'Delay', nodeType: 'effect',
      params: [
        { label: 'Time',     value: 0.25, min: 0.01, max: 1,    unit: 's' },
        { label: 'Feedback', value: 0.3,  min: 0,    max: 0.95 },
        { label: 'Mix',      value: 0.3,  min: 0,    max: 1 },
      ],
    },
  },
  {
    type: 'nodeCard', section: 'Effect', label: 'Gain',
    data: {
      label: 'Gain', nodeType: 'effect',
      params: [{ label: 'dB', value: 0, min: -24, max: 24, unit: 'dB' }],
    },
  },
  { type: 'nodeCard', section: 'Effect', label: 'VST3 Plugin', data: { label: 'VST3 Plugin', nodeType: 'effect' } },

  // Sinks
  { type: 'nodeCard', section: 'Sink', label: 'ASIO Out', data: { label: 'ASIO Out', nodeType: 'sink', hasOutput: false } },
  { type: 'nodeCard', section: 'Sink', label: 'File Out',  data: { label: 'File Out',  nodeType: 'sink', hasOutput: false } },
]
