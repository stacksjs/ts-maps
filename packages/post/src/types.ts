import type { Buffer } from 'node:buffer'
import type { TLSSocketOptions } from 'node:tls'

export interface MailServerConfig {
  // Server Configuration
  server: {
    name: string
    secure: boolean
    ports: {
      smtp: number
      smtps: number
      submission: number
    }
  }

  // TLS Configuration
  tls: {
    cert: string
    key: string
    domains: string[]
    needsUpgrade?: boolean
    sniOptions?: Map<string, TLSSocketOptions> | Record<string, TLSSocketOptions>
  }

  // Authentication
  auth: {
    methods: string[]
    database: string
    maxAllowedUnauthenticatedCommands?: number
  }

  // Storage
  storage: {
    type: 'disk' | 's3' | 'memory'
    path: string
    quota: string
  }

  // Security
  security: {
    rateLimit: {
      window: string
      max: number
    }
    spamProtection: boolean
    dnsbl: string[]
    blacklist: string[]
    whitelist: string[]
  }

  // Logging
  logging: {
    level: 'debug' | 'info' | 'warn' | 'error'
    file: string
    format: 'json' | 'text'
  }

  // General
  verbose: boolean
}

export type MailServerOptions = Partial<MailServerConfig>

export interface ParsedAddress {
  address: string
  args: Record<string, any>
}

// Define handler types
export type CommandHandler = (command: Buffer, callback?: () => void) => void
export type NoArgsHandler = () => void

export interface AuthOptions {
  method: string
  username?: string
  password?: string
  accessToken?: string
  validatePassword?: (password: string) => boolean
}

export interface AuthResponse {
  user?: any
  data?: {
    status?: string
    schemes?: string
    scope?: string
  }
  message?: string
  responseCode?: number
}

export interface AuthError extends Error {
  responseCode?: number
}

export type AuthCallback = (err: AuthError | null, response?: any) => void
// type SASLHandler = (this: SMTPConnection, args: string[], callback: () => void) => void
