import type { TsMap } from 'ts-maps'
import type { InjectionKey, Ref } from 'vue'

/**
 * Injection key for the current `TsMap` instance. Stored as a `Ref` so that
 * children can react to late-mount timing and instance replacement.
 */
export const mapKey: InjectionKey<Ref<TsMap | null>> = Symbol('ts-maps/vue/map')
