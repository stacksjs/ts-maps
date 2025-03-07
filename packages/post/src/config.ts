import type { MailServerConfig } from './types'
import { homedir } from 'node:os'
import { resolve } from 'node:path'
import { loadConfig } from 'bunfig'

export const defaultConfig: MailServerConfig = {
  server: {
    name: 'localhost',
    secure: false,
    ports: {
      smtp: 25,
      smtps: 465,
      submission: 587,
    },
  },

  tls: {
    cert: resolve(homedir(), '.post/certs/cert.pem'),
    key: resolve(homedir(), '.post/certs/key.pem'),
    domains: [],
    needsUpgrade: false,
  },

  auth: {
    methods: ['PLAIN', 'LOGIN'],
    database: 'sqlite://~/.post/users.db',
    maxAllowedUnauthenticatedCommands: 10,
  },

  storage: {
    type: 'disk',
    path: resolve(homedir(), '.post/mail'),
    quota: '1GB',
  },

  security: {
    rateLimit: {
      window: '1h',
      max: 1000,
    },
    spamProtection: true,
    dnsbl: ['zen.spamhaus.org'],
    blacklist: [],
    whitelist: [],
  },

  logging: {
    level: 'info',
    file: resolve(homedir(), '.post/logs/post.log'),
    format: 'json',
  },

  verbose: false,
}

// @ts-expect-error dtsx issue
// eslint-disable-next-line antfu/no-top-level-await
export const config: MailServerConfig = await loadConfig({
  name: 'post',
  cwd: resolve(__dirname, '..'),
  defaultConfig,
})
