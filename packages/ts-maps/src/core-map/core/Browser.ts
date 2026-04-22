// Browser feature detection used internally.

function userAgentContains(str: string): boolean {
  if (typeof navigator === 'undefined' || typeof navigator.userAgent === 'undefined')
  return false
  return navigator.userAgent.toLowerCase().includes(str)
}

const chrome = userAgentContains('chrome')
const safari = !chrome && userAgentContains('safari')
const mobile = typeof (globalThis as any).orientation !== 'undefined'
const pointer = typeof window === 'undefined' ? false : !!window.PointerEvent
const touchNative = typeof window === 'undefined' ? false : 'ontouchstart' in window || !!(window as any).TouchEvent
const touch = touchNative || pointer
const retina = typeof window === 'undefined' || typeof window.devicePixelRatio === 'undefined' ? false : window.devicePixelRatio > 1
const mac = typeof navigator === 'undefined' || typeof navigator.platform === 'undefined' ? false : navigator.platform.startsWith('Mac')
const linux = typeof navigator === 'undefined' || typeof navigator.platform === 'undefined' ? false : navigator.platform.startsWith('Linux')

export interface BrowserInfo {
  chrome: boolean
  safari: boolean
  mobile: boolean
  pointer: boolean
  touch: boolean
  touchNative: boolean
  retina: boolean
  mac: boolean
  linux: boolean
}

const Browser: BrowserInfo = {
  chrome,
  safari,
  mobile,
  pointer,
  touch,
  touchNative,
  retina,
  mac,
  linux,
}

export default Browser
