import { GlobalRegistrator } from 'very-happy-dom'

GlobalRegistrator.register()

// Opt into React's act() environment to silence test warnings.
;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true
