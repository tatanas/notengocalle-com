import { registerCarStepsMode, registerTransitStepsMode } from '../steps.js'

registerCarStepsMode(
  'rs-any-car',
  'Paso a paso · libre · auto',
  'Lo mismo, pero entre dos puntos cualquiera de la ciudad.',
  r => !r.o,
)
registerTransitStepsMode(
  'rs-any-tp',
  'Paso a paso · libre · micro y metro',
  'Lo mismo, entre dos puntos cualquiera.',
  r => !r.o,
)
