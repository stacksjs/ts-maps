import type { CloudConfig } from '@stacksjs/ts-cloud'
import { readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const DOMAIN = 'ts-maps.stacksjs.com'

/**
 * A redirect for every docs page from its file name to its page:
 * `/examples/01-basic-map.md` → `/examples/01-basic-map`. The docs link to
 * each other as files, so a link copied from GitHub asks for the `.md`; the
 * built site rewrites its own links (scripts/fix-doc-links.ts), but a saved
 * or shared one would 404.
 */
function markdownRedirects(dir = 'docs'): Record<string, { deploy: 'server', domain: string, path: string, redirect: { to: string, preservePath: false } }> {
  const out: ReturnType<typeof markdownRedirects> = {}
  for (const name of readdirSync(dir)) {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) {
      if (!name.startsWith('.') && !name.startsWith('_') && name !== 'public')
        Object.assign(out, markdownRedirects(path))
      continue
    }
    if (!name.endsWith('.md'))
      continue
    const file = relative('docs', path).split('\\').join('/')
    const page = file.replace(/(?:^|\/)index\.md$/, '').replace(/\.md$/, '')
    out[`md_${file.replace(/[^a-z0-9]+/gi, '_')}`] = {
      deploy: 'server',
      domain: DOMAIN,
      path: `/${file}`,
      redirect: { to: `https://${DOMAIN}/${page}${page && file.endsWith('index.md') ? '/' : ''}`, preservePath: false },
    }
  }
  return out
}

/** Pages renamed or folded into others, from the old path to the new. */
const RENAMED: Record<string, string> = {
  'examples/06-hillshade': 'examples/06-terrain',
  'examples/09-geocoder': 'examples/09-search',
  'examples/10-directions': 'examples/10-turn-by-turn',
  // Folded into the guide's walkthrough.
  'getting-started': 'guide/getting-started',
  'usage': 'guide/getting-started',
}

/** The old pages, and their `.md` files, sent on to the new ones, so a saved link still lands. */
function renamedRedirects(): ReturnType<typeof markdownRedirects> {
  const out: ReturnType<typeof markdownRedirects> = {}
  for (const [from, to] of Object.entries(RENAMED)) {
    for (const path of [`/${from}`, `/${from}.md`]) {
      out[`renamed_${path.replace(/[^a-z0-9]+/gi, '_')}`] = {
        deploy: 'server',
        domain: DOMAIN,
        path,
        redirect: { to: `https://${DOMAIN}/${to}`, preservePath: false },
      }
    }
  }
  return out
}

/**
 * ts-cloud deployment config for ts-maps.stacksjs.com.
 *
 * The docs, with the core-map playground built into /playground/, as one
 * static site on the shared Stacks Hetzner box. `bun run build:site` renders
 * them into dist/.bunpress; the deploy ships that directory and rpx serves it.
 *
 * @see https://github.com/stacksjs/ts-cloud
 */
const config: CloudConfig = {
  project: {
    name: 'ts-maps',
    slug: 'ts-maps',
    region: 'us-east-1',
  },

  environments: {
    production: {
      type: 'production',
      // Push to `main` → deploy here.
      deployBranch: 'main',
      variables: { NODE_ENV: 'production' },
    },
  },

  // A tenant on the box the `stacks` project owns, not a server of its own:
  // the deploy resolves `stacks-production-app`, ships only this site, and
  // adds an rpx `sites.d/ts-maps.json` fragment. It never touches the box's
  // lifecycle or the other tenants.
  cloud: {
    provider: 'hetzner',
    attachTo: 'stacks',
  },
  hetzner: {
    // apiToken falls back to HCLOUD_TOKEN in the environment.
    location: 'fsn1',
    image: 'ubuntu-24.04',
    sshPrivateKeyPath: '~/.ssh/id_ed25519',
    sshUser: 'root',
  },

  infrastructure: {
    compute: {
      mode: 'server',
      size: 'small',
      runtime: 'bun',
      // rpx serves the box, not nginx. Both are set so the deploy never stands
      // up nginx and certbot, which would race rpx for :80.
      webServer: 'rpx',
      proxy: {
        engine: 'rpx',
        // A Let's Encrypt certificate for the host on its first HTTPS hit,
        // once DNS resolves.
        onDemandTls: true,
        onDemandTlsEmail: 'hello@stacksjs.com',
        // Production, never the staging ACME directory: without the flag tlsx
        // falls back to staging, whose certificates no browser trusts.
        onDemandTlsStaging: false,
      },
    },

    // The zone the host lives in, on Cloudflare (CLOUDFLARE_API_TOKEN). No
    // `records`: the zone's own records belong to stacksjs.com; the deploy
    // only adds an A record for the site's domain.
    dns: {
      provider: 'cloudflare',
      domain: 'stacksjs.com',
    },
  },

  sites: {
    docs: {
      deploy: 'server',
      // BunPress renders into a `.bunpress` subdirectory of its outdir, so
      // that is the document root.
      root: 'dist/.bunpress',
      path: '/',
      domain: DOMAIN,
      build: 'bun run build:docs',
      // BunPress writes clean directory URLs: /concepts/3d → concepts/3d/index.html.
      pathRewriteStyle: 'directory',
    },

    // The core-map playground, a route of its own on the same host: its pages
    // are files (`17-look-around.html`) that link to each other and register
    // a service worker by relative URL, which the docs' clean URLs would
    // redirect to a directory that is not there. The longer path wins.
    playground: {
      deploy: 'server',
      root: 'dist/playground',
      path: '/playground',
      domain: DOMAIN,
      build: 'bun scripts/build-playground.ts dist/playground',
      pathRewriteStyle: 'flat',
    },

    ...markdownRedirects(),
    ...renamedRedirects(),
  },
}

export default config
