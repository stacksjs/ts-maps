/**
 * The words the built-in UI uses, in the reader's language.
 *
 * Apple Maps speaks the language the phone is set to. Here the search
 * field, the place card, Offline Maps, the map type picker and turn-by-turn
 * read their words from one catalogue, keyed by what they are for
 * (`search.placeholder`, `offline.download`), in the control's `locale`,
 * else the map's, else the browser's (`navigator.language`). A locale
 * missing a message falls back to its language (`de-AT` to `de`), then to
 * English.
 *
 * English and German are built in. `addMessages('fr', { … })` adds a
 * language, or changes the words of one that is there.
 */

import { controlMessages } from './messages/controls'
import { lookAroundMessages } from './messages/lookaround'
import { navigationMessages } from './messages/navigation'
import { offlineMessages } from './messages/offline'
import { searchMessages } from './messages/search'

/**
 * A message: text with `{name}` slots, or by plural form for one with a
 * `{count}`, as `Intl.PluralRules` names them (`one`, `other`, …).
 */
export type Message = string | Partial<Record<Intl.LDMLPluralRule, string>> & { other: string }

export type Catalogue = Record<string, Message>

const catalogues: Record<string, Catalogue> = {}

/** Add a language's messages, or replace some of one already there. */
export function addMessages(locale: string, messages: Catalogue): void {
  const key = locale.toLowerCase()
  catalogues[key] = { ...catalogues[key], ...messages }
}

for (const part of [searchMessages, offlineMessages, navigationMessages, controlMessages, lookAroundMessages]) {
  for (const [locale, messages] of Object.entries(part))
    addMessages(locale, messages)
}

/** The languages with messages, as given to `addMessages`. */
export function messageLocales(): string[] {
  return Object.keys(catalogues)
}

/** The locale to use: the one given, else the browser's, else English. */
export function resolveLocale(locale?: string): string {
  if (locale)
    return locale
  if (typeof navigator !== 'undefined' && navigator.language)
    return navigator.language
  return 'en'
}

/** `de-AT`, then `de`, then English: where to look for a message. */
function chain(locale: string): string[] {
  const lower = locale.toLowerCase()
  const language = lower.split(/[-_]/)[0]!
  return [...new Set([lower, language, 'en'])]
}

/** A message by key, its slots filled. The key itself where no language has it. */
export function message(locale: string | undefined, key: string, params: Record<string, string | number> = {}): string {
  const resolved = resolveLocale(locale)
  let found: Message | undefined
  let from = 'en'
  for (const l of chain(resolved)) {
    found = catalogues[l]?.[key]
    if (found !== undefined) {
      from = l
      break
    }
  }
  if (found === undefined)
    return key
  let text: string
  if (typeof found === 'string') {
    text = found
  }
  else {
    const count = Number(params.count ?? 0)
    let rule: Intl.LDMLPluralRule = 'other'
    try {
      rule = new Intl.PluralRules(from).select(count)
    }
    catch {}
    text = found[rule] ?? found.other
  }
  return text.replace(/\{(\w+)\}/g, (whole, name: string) => {
    const value = params[name]
    if (value === undefined)
      return whole
    return typeof value === 'number' ? formatNumber(value, resolved) : value
  })
}

/** Whether a locale, or English, has a message. */
export function hasMessage(locale: string | undefined, key: string): boolean {
  return chain(resolveLocale(locale)).some(l => catalogues[l]?.[key] !== undefined)
}

/** The `message` function for one locale. */
export type Translate = (key: string, params?: Record<string, string | number>) => string

export function translator(locale?: string): Translate {
  return (key, params) => message(locale, key, params)
}

/**
 * The locale a control speaks: its own `locale` option, else its map's,
 * else the browser's.
 */
export function controlLocale(control: { options?: { locale?: string }, _map?: { options?: { locale?: string } } }): string {
  return resolveLocale(control.options?.locale ?? control._map?.options?.locale)
}

/** A number in the locale's way: `1,234.5` or `1.234,5`. */
export function formatNumber(value: number, locale?: string, options?: Intl.NumberFormatOptions): string {
  try {
    return new Intl.NumberFormat(resolveLocale(locale), options).format(value)
  }
  catch {
    return String(value)
  }
}

/** A date in the locale's way: `Sep 23` or `23. Sept.`. */
export function formatDate(date: Date | number, locale?: string, options: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' }): string {
  try {
    return new Intl.DateTimeFormat(resolveLocale(locale), options).format(date)
  }
  catch {
    return new Date(date).toDateString()
  }
}

/** The language part of a locale: `de` for `de-AT`. */
export function languageOf(locale?: string): string {
  return resolveLocale(locale).toLowerCase().split(/[-_]/)[0]!
}
