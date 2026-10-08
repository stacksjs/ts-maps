/**
 * Edit and run: a docs example's source beside the example running, at
 * /playground/examples/edit.html?example=<name>.
 *
 * The source is the example's own TypeScript, importing from `'ts-maps'` as
 * yours would. Run compiles it in the browser with Sucrase, which only strips
 * the types, and runs it in a frame that is the example's page — its map, its
 * panel, its styles — with an import map pointing `ts-maps` at the library's
 * own build. Edits are kept in this browser, per example, until Reset.
 */

interface ExampleSource {
  title: string
  source: string
  panel: string
}

const SUCRASE = 'https://cdn.jsdelivr.net/npm/sucrase@3.35.0/+esm'
const SHORTCUT = /Mac|iP(?:hone|ad)/.test(navigator.platform) ? '⌘↵' : 'Ctrl+Enter'
const KEYWORDS = new Set(['import', 'from', 'export', 'const', 'let', 'var', 'function', 'return', 'if', 'else', 'for', 'of', 'in', 'new', 'await', 'async', 'void', 'as', 'type', 'interface', 'true', 'false', 'null', 'undefined', 'typeof', 'while', 'break', 'continue', 'class', 'extends', 'this', 'try', 'catch', 'throw'])

const find = <T extends HTMLElement>(selector: string): T => document.querySelector(selector) as T
const code = find<HTMLTextAreaElement>('#code')
const highlight = find<HTMLElement>('#highlight')
const frame = find<HTMLIFrameElement>('#preview')
const picker = find<HTMLSelectElement>('#example')
const status = find<HTMLElement>('#status')
const fullScreen = find<HTMLAnchorElement>('#full-screen')
const docs = find<HTMLAnchorElement>('#docs')

let sources: Record<string, ExampleSource> = {}
let name = ''

/** The example as the docs show it: importing the package, not the repo's source. */
function original(of: string): string {
  return sources[of]!.source.replace(/(['"])\.\.\/\.\.\/packages\/ts-maps\/src\/core-map\1/g, '\'ts-maps\'')
}

function saved(of: string): string | null {
  try {
    return localStorage.getItem(`ts-maps-example:${of}`)
  }
  catch {
    return null
  }
}

function save(of: string, text: string | null): void {
  try {
    if (text === null)
      localStorage.removeItem(`ts-maps-example:${of}`)
    else
      localStorage.setItem(`ts-maps-example:${of}`, text)
  }
  catch {}
}

function escape(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/** Just enough colour to read by: comments, strings, numbers and keywords. */
function colour(text: string): string {
  const token = /\/\/[^\n]*|\/\*[\s\S]*?\*\/|'(?:\\.|[^'\\\n])*'|"(?:\\.|[^"\\\n])*"|`(?:\\.|[^`\\])*`|\b\d[\d_.]*\b|\b[A-Za-z_$][\w$]*\b/g
  let out = ''
  let last = 0
  for (const match of text.matchAll(token)) {
    const t = match[0]
    out += escape(text.slice(last, match.index))
    last = match.index! + t.length
    const kind = t.startsWith('//') || t.startsWith('/*')
      ? 'comment'
      : /^['"`]/.test(t) ? 'string' : /^\d/.test(t) ? 'number' : KEYWORDS.has(t) ? 'keyword' : ''
    out += kind ? `<span class="${kind}">${escape(t)}</span>` : escape(t)
  }
  // A trailing newline needs something after it to take up its line.
  return `${out + escape(text.slice(last))}\n`
}

function paint(): void {
  highlight.innerHTML = colour(code.value)
  highlight.scrollTop = code.scrollTop
  highlight.scrollLeft = code.scrollLeft
}

function say(text: string, error = false): void {
  status.textContent = text
  status.classList.toggle('error', error)
}

let compile: ((source: string) => string) | undefined

async function run(): Promise<void> {
  say('Running…')
  try {
    if (!compile) {
      const sucrase = await import(SUCRASE) as { transform: (code: string, options: Record<string, unknown>) => { code: string } }
      compile = source => sucrase.transform(source, { transforms: ['typescript'], disableESTransforms: true, keepUnusedImports: true }).code
    }
    const js = compile(code.value)
    const base = new URL('./', location.href).href
    const imports: Record<string, string> = { 'ts-maps': `${base}lib/ts-maps.js` }
    for (const module of ['terminal', 'transamerica'])
      imports[`./data/${module}`] = `${base}data/${module}.js`
    // The script ends the page; a `</script>` in a string would end it early.
    const script = js.replace(/<\/script/gi, '<\\/script')
    frame.srcdoc = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <base href="${base}" />
    <link rel="stylesheet" href="../ts-maps.css" />
    <link rel="stylesheet" href="./examples.css" />
    <script type="importmap">${JSON.stringify({ imports })}</script>
    <script>
      addEventListener('error', e => parent.postMessage({ example: 'error', message: e.message }, '*'))
      addEventListener('unhandledrejection', e => parent.postMessage({ example: 'error', message: String(e.reason?.message ?? e.reason) }, '*'))
    </script>
  </head>
  <body>
    <div id="map"></div>${sources[name]!.panel}
    <script type="module">${script}
parent.postMessage({ example: 'ran' }, '*')</script>
  </body>
</html>`
  }
  catch (err) {
    say((err as Error).message, true)
  }
}

addEventListener('message', (e: MessageEvent) => {
  if (e.source !== frame.contentWindow)
    return
  if (e.data?.example === 'error')
    say(e.data.message, true)
  else if (e.data?.example === 'ran' && !status.classList.contains('error'))
    say(`Running. ${SHORTCUT} runs it again.`)
})

function load(next: string): void {
  name = next
  picker.value = name
  code.value = saved(name) ?? original(name)
  fullScreen.href = `./${name}.html`
  docs.href = `/examples/${name}`
  document.title = `Edit ${sources[name]!.title} — ts-maps`
  const url = new URL(location.href)
  url.searchParams.set('example', name)
  history.replaceState(null, '', url)
  paint()
  void run()
}

picker.addEventListener('change', () => load(picker.value))

code.addEventListener('input', () => {
  paint()
  save(name, code.value === original(name) ? null : code.value)
})
code.addEventListener('scroll', paint)
code.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
    e.preventDefault()
    void run()
  }
  else if (e.key === 'Tab' && !e.shiftKey) {
    e.preventDefault()
    document.execCommand('insertText', false, '  ')
  }
})
find('#run').addEventListener('click', () => void run())
find('#reset').addEventListener('click', () => {
  save(name, null)
  load(name)
})

/** Every example's source, then the one the address names. */
async function start(): Promise<void> {
  sources = await (await fetch('./sources.json')).json() as Record<string, ExampleSource>
  const names = Object.keys(sources)
  for (const n of names)
    picker.add(new Option(sources[n]!.title, n))
  const asked = new URLSearchParams(location.search).get('example') ?? ''
  load(names.includes(asked) ? asked : names[0]!)
}

void start()
