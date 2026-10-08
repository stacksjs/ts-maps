import type { Map as MapInstance } from 'ts-maps'
import type { InjectionKey, Ref } from 'vue'

/**
 * Injection key for the current map. Stored as a `Ref` so that
 * children can react to late-mount timing and instance replacement.
 */
export const mapKey: InjectionKey<Ref<MapInstance | null>> = Symbol('ts-maps/vue/map')
