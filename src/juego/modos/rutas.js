import { registrarModoDePasosEnAuto, registrarModoDePasosEnTransporte } from '../pasos.js'

registrarModoDePasosEnAuto('rs-any-car', 'Paso a paso · libre · auto', r => !r.o)
registrarModoDePasosEnTransporte('rs-any-tp', 'Paso a paso · libre · micro y metro', r => !r.o)
