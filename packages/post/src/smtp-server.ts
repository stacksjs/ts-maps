import type { AddressInfo, Server, Socket } from 'node:net'
import type { SecureContext, TLSSocketOptions } from 'node:tls'
import { Buffer } from 'node:buffer'
import { randomBytes } from 'node:crypto'
import { EventEmitter } from 'node:events'
import { createServer } from 'node:net'
import { createSecureContext, TLSSocket } from 'node:tls'
import { toUnicode } from 'ts-punycode'
import { SMTPConnection } from './smtp-connection'
import { getTLSOptions } from './utils/tls-options'

interface Logger {
  info: (...args: any[]) => void
  debug: (...args: any[]) => void
  error: (...args: any[]) => void
}

const CLOSE_TIMEOUT = 30 * 1000 // how much to wait until pending connections are terminated

/**
 * Implements comprehensive configuration options for establishing and managing a fully-featured SMTP server with extensive customization capabilities. (125 chars)
 * Provides detailed control over authentication mechanisms, security settings, and protocol-specific behaviors for mail handling. (110 chars)
 * Supports both standard SMTP and extended protocol features for maximum flexibility. (75 chars)
 *
 * @default undefined
 *
 * @example
 * ```ts
 * const options: SMTPServerOptions = {
 *   secure: true,
 *   name: 'my-smtp-server',
 *   authMethods: ['PLAIN', 'LOGIN']
 * }
 * ```
 */
export interface SMTPServerOptions {
  /**
   * Establishes a fully encrypted communication channel requiring TLS for all incoming connections and subsequent message transfers. (115 chars)
   * Automatically configures the server to use secure transport without requiring explicit STARTTLS commands. (95 chars)
   * Enhances overall mail transfer security and privacy. (50 chars)
   *
   * @default false
   *
   * @example
   * ```ts
   * const server = new SMTPServer({ secure: true })
   * ```
   */
  secure?: boolean

  /**
   * Configures the SMTP server to exclusively accept pre-established TLS connections from all connecting mail clients and proxies. (110 chars)
   * Bypasses the standard STARTTLS negotiation process when operating behind TLS-terminating load balancers. (90 chars)
   * Streamlines secure connection handling. (35 chars)
   *
   * @default false
   *
   * @example
   * ```ts
   * const server = new SMTPServer({ needsUpgrade: true })
   * ```
   */
  needsUpgrade?: boolean

  /**
   * Enforces strict message size limitations to protect server resources from oversized emails and potential denial-of-service attempts. (115 chars)
   * Automatically rejects messages exceeding the specified byte limit before they consume excessive bandwidth. (90 chars)
   * Maintains optimal server performance. (32 chars)
   *
   * @default undefined - no size limit
   *
   * @example
   * ```ts
   * const server = new SMTPServer({ size: 1024 * 1024 }) // 1MB limit
   * ```
   */
  size?: number

  /**
   * Establishes the primary identity of this SMTP server for all protocol communications and greetings.
   * Appears in server responses and helps with mail routing decisions.
   * Aids delivery.
   *
   * @default os.hostname()
   *
   * @example
   * ```ts
   * const server = new SMTPServer({ name: 'mail.example.com' })
   * ```
   */
  name?: string

  /**
   * Defines a custom welcome message shown to clients upon connection.
   * Replaces the standard SMTP greeting with personalized text.
   * Useful for branding and server role identification.
   * @default undefined - uses standard greeting
   * @example
   * ```ts
   * const server = new SMTPServer({ banner: 'Welcome to My SMTP Server' })
   * ```
   */
  banner?: string

  /**
   * Controls the visibility of STARTTLS upgrade capability in server responses.
   * Prevents automatic TLS negotiation attempts by clients.
   * Recommended when using external TLS termination.
   * @default false
   * @example
   * ```ts
   * const server = new SMTPServer({ hideSTARTTLS: true })
   * ```
   */
  hideSTARTTLS?: boolean

  /**
   * Controls whether the server advertises support for message size limits.
   * Affects client behavior regarding message size checking.
   * Useful for custom size limit implementation strategies.
   * @default false
   * @example
   * ```ts
   * const server = new SMTPServer({ hideSize: true })
   * ```
   */
  hideSize?: boolean

  /**
   * Manages the advertisement of command pipelining support to clients.
   * Affects how clients optimize multiple command submissions.
   * Important for performance and compatibility considerations.
   * @default false
   * @example
   * ```ts
   * const server = new SMTPServer({ hidePIPELINING: true })
   * ```
   */
  hidePIPELINING?: boolean

  /**
   * Controls server's advertisement of 8-bit MIME message support.
   * Impacts how clients encode message content for transmission.
   * Critical for international message handling capabilities.
   * @default false
   * @example
   * ```ts
   * const server = new SMTPServer({ hide8BITMIME: true })
   * ```
   */
  hide8BITMIME?: boolean

  /**
   * Manages the server's indication of UTF-8 email address support.
   * Affects handling of internationalized email addresses and headers.
   * Key for proper international mail processing support.
   * @default false
   * @example
   * ```ts
   * const server = new SMTPServer({ hideSMTPUTF8: true })
   * ```
   */
  hideSMTPUTF8?: boolean

  /**
   * Specifies the list of supported authentication mechanisms for client verification.
   * Controls available options for user authentication and security.
   * Crucial for implementing appropriate security measures.
   * @default ['LOGIN', 'PLAIN']
   * @example
   * ```ts
   * const server = new SMTPServer({ authMethods: ['PLAIN', 'LOGIN', 'CRAM-MD5'] })
   * ```
   */
  authMethods?: string[]

  /**
   * Lists SMTP commands that should be rejected when received from clients.
   * Provides fine-grained control over allowed server operations.
   * Essential for implementing security policies.
   * @default []
   * @example
   * ```ts
   * const server = new SMTPServer({ disabledCommands: ['AUTH', 'STARTTLS'] })
   * ```
   */
  disabledCommands?: string[]

  /**
   * Sets a limit on commands accepted before requiring authentication.
   * Protects server resources from unauthorized command flooding.
   * Key security feature for public-facing servers.
   * @default undefined - no limit
   * @example
   * ```ts
   * const server = new SMTPServer({ maxAllowedUnauthenticatedCommands: 10 })
   * ```
   */
  maxAllowedUnauthenticatedCommands?: number

  /**
   * Enables support for the XCLIENT protocol extension in the server. Allows
   * trusted upstream servers to provide original client information.
   * Essential for maintaining accurate client connection details.
   * @default false
   * @example
   * ```ts
   * const server = new SMTPServer({ useXClient: true })
   * ```
   */
  useXClient?: boolean

  /**
   * Activates the XFORWARD protocol extension for connection information.
   * Preserves original sender details through mail forwarding chains.
   * Important for email tracking and security measures.
   * @default false
   * @example
   * ```ts
   * const server = new SMTPServer({ useXForward: true })
   * ```
   */
  useXForward?: boolean

  /**
   * Switches the server from standard SMTP to Local Mail Transfer Protocol mode. Enables
   * immediate per-recipient success/failure responses for local delivery. Particularly
   * valuable for mail delivery agents and local mail processing systems.
   * @default false
   * @example
   * ```ts
   * const server = new SMTPServer({ lmtp: true })
   * ```
   */
  lmtp?: boolean

  /**
   * Establishes the duration of inactivity before closing client connections.
   * Helps manage server resources by terminating stale connections.
   * Important for maintaining optimal server performance.
   * @default 60000 (60 seconds)
   * @example
   * ```ts
   * const server = new SMTPServer({ socketTimeout: 30000 }) // 30 seconds
   * ```
   */
  socketTimeout?: number

  /**
   * Sets the grace period for completing transactions during server shutdown.
   * Allows ongoing email transfers to complete before termination.
   * Ensures clean shutdown without losing in-progress messages.
   * @default 30000 (30 seconds)
   * @example
   * ```ts
   * const server = new SMTPServer({ closeTimeout: 15000 }) // 15 seconds
   * ```
   */
  closeTimeout?: number

  /**
   * Indicates whether incoming connections are already TLS encrypted.
   * Bypasses built-in TLS handling for pre-secured connections.
   * Common in proxy-based or cloud hosting environments.
   * @default false
   * @example
   * ```ts
   * const server = new SMTPServer({ secured: true })
   * ```
   */
  secured?: boolean

  /**
   * Configures support for the PROXY protocol in connection handling. Enables
   * processing of connection details from trusted proxy servers.
   * Critical for maintaining client identity in proxy setups.
   * @default false
   * @example
   * ```ts
   * const server = new SMTPServer({ useProxy: ['127.0.0.1', '10.0.0.0/8'] })
   * ```
   */
  useProxy?: boolean | string[]

  /**
   * Specifies IP addresses to exclude from PROXY protocol processing. Maintains
   * security by filtering unwanted proxy information sources.
   * Helps prevent proxy header spoofing attacks.
   * @default []
   * @example
   * ```ts
   * const server = new SMTPServer({ ignoredHosts: ['1.2.3.4', '5.6.7.8'] })
   * ```
   */
  ignoredHosts?: string[]

  /**
   * Handles certificate selection for multiple domains in TLS connections.
   * Enables dynamic SSL/TLS certificate loading based on client SNI.
   * Essential for hosting multiple secure domains on one server.
   * @default undefined
   * @example
   * ```ts
   * const server = new SMTPServer({
   *   SNICallback: (servername, cb) => {
   *     cb(null, tls.createSecureContext({
   *       key: fs.readFileSync(`certs/${servername}.key`),
   *       cert: fs.readFileSync(`certs/${servername}.cert`)
   *     }))
   *   }
   * })
   * ```
   */
  SNICallback?: (servername: string, cb: (err: Error | null, ctx?: SecureContext) => void) => void

  /**
   * Provides custom logging functionality for server operations and events.
   * Enables integration with external logging systems and monitoring.
   * Crucial for debugging and operational maintenance.
   * @default internal logger
   * @example
   * ```ts
   * const server = new SMTPServer({
   *   logger: {
   *     info: console.log,
   *     debug: console.debug,
   *     error: console.error
   *   }
   * })
   * ```
   */
  logger?: Logger

  /**
   * Defines the identifier used in logging output for this server instance. Facilitates
   * log filtering and component identification in larger systems.
   * Improves log readability and troubleshooting efficiency.
   * @default 'smtp-server'
   * @example
   * ```ts
   * const server = new SMTPServer({ component: 'custom-smtp' })
   * ```
   */
  component?: string

  /**
   * Allows injection of a pre-configured server instance for custom handling.
   * Enables advanced server customization beyond standard options.
   * Perfect for specialized deployment scenarios.
   * @default undefined - creates new server
   * @example
   * ```ts
   * const customServer = net.createServer()
   * const server = new SMTPServer({ server: customServer })
   * ```
   */
  server?: Server

  /**
   * Manages TLS configuration options for different domain names. Enables
   * domain-specific security settings and certificate management.
   * Vital for multi-domain secure mail handling.
   * @default undefined
   * @example
   * ```ts
   * const server = new SMTPServer({
   *   sniOptions: new Map([
   *     ['example.com', {
   *       key: fs.readFileSync('example.com.key'),
   *       cert: fs.readFileSync('example.com.cert')
   *     }]
   *   ])
   * })
   * ```
   */
  sniOptions?: Map<string, TLSSocketOptions> | Record<string, TLSSocketOptions>

  /**
   * Enables extension of server configuration with custom handler functions and settings.
   * Provides flexibility for implementing specialized server behaviors.
   * Perfect for unique use cases and custom protocols.
   * @default undefined
   * @example
   * ```ts
   * const server = new SMTPServer({
   *   customHandler: (mail) => {  ...  },
   *   customConfig: { key: 'value' }
   * })
   * ```
   */
  [key: string]: any
}

export interface SocketOptions {
  id: string
  remoteAddress?: string
  remotePort?: number
  ignore?: boolean
}

export interface AuthData {
  method: string
  [key: string]: any
}

export interface Session {
  [key: string]: any
}

/**
 * Creates a SMTP server instance.
 *
 * @constructor
 * @param {object} options Connection and SMTP options
 */
export class SMTPServer extends EventEmitter {
  public options: SMTPServerOptions
  public logger: Logger
  public connections: Set<SMTPConnection>
  public server: Server
  public secureContext: Map<string, SecureContext>
  private _closeTimeout: NodeJS.Timeout | null

  constructor(options: SMTPServerOptions = { authMethods: [], disabledCommands: [] }) {
    super()

    this.options = {
      authMethods: [],
      disabledCommands: [],
      ...options,
    }
    this.connections = new Set()
    this.secureContext = new Map()
    this._closeTimeout = null

    this.updateSecureContext({})

    // setup disabled commands list
    this.options.disabledCommands = ([] as string[])
      .concat(this.options.disabledCommands || [])
      .map(command => String(command || '').toUpperCase().trim())

    // setup allowed auth methods
    this.options.authMethods = ([] as string[])
      .concat(this.options.authMethods || [])
      .map(method => String(method || '').toUpperCase().trim())

    if (!this.options.authMethods.length)
      this.options.authMethods = ['LOGIN', 'PLAIN']

    this.logger = getLogger(this.options, {
      component: this.options.component || 'smtp-server',
    })

    // apply shorthand handlers
    ;['onConnect', 'onSecure', 'onAuth', 'onMailFrom', 'onRcptTo', 'onData', 'onClose'].forEach((handler) => {
      if (typeof this.options[handler] === 'function')
        this[handler as keyof this] = this.options[handler]
    })

    // setup server listener and connection handler
    if (this.options.secure && !this.options.needsUpgrade) {
      this.server = createServer({}, (socket: Socket) => {
        this._handleProxy(socket, (err: Error | null, socketOptions: SocketOptions) => {
          if (err) {
            // ignore, should not happen
          }

          if (this.options.secured)
            return this.connect(socket, socketOptions)

          this._upgrade(socket, (err: Error | null, tlsSocket: TLSSocket) => {
            if (err)
              return this._onError(err)

            this.connect(tlsSocket, socketOptions)
          })
        })
      })
    }
    else {
      this.server = createServer({}, (socket: Socket) =>
        this._handleProxy(socket, (err: Error | null, socketOptions: SocketOptions) => {
          if (err) {
            // ignore, should not happen
          }
          this.connect(socket, socketOptions)
        }))
    }

    this._setListeners()
  }

  connect(socket: Socket | TLSSocket, socketOptions: SocketOptions): void {
    const connection = new SMTPConnection(this as any, socket, socketOptions)
    this.connections.add(connection)
    connection.on('error', (err: Error) => this._onError(err))
    connection.on('connect', (data: any) => this._onClientConnect(data))
    connection.init()
  }

  /**
   * Start listening on selected port and interface
   */
  listen(...args: any[]): Server {
    return this.server.listen(...args)
  }

  /**
   * Closes the server
   *
   * @param {Function} callback Callback to run once the server is fully closed
   */
  close(callback?: () => void): void {
    let connections = this.connections.size
    const timeout = this.options.closeTimeout || CLOSE_TIMEOUT

    // stop accepting new connections
    this.server.close(() => {
      if (this._closeTimeout)
        clearTimeout(this._closeTimeout)
      if (typeof callback === 'function') {
        callback()
      }
    })

    // close active connections
    if (connections) {
      this.logger.info(
        {
          tnx: 'close',
        },
        'Server closing with %s pending connection%s, waiting %s seconds before terminating',
        connections,
        connections !== 1 ? 's' : '',
        timeout / 1000,
      )
    }

    this._closeTimeout = setTimeout(() => {
      connections = this.connections.size
      if (connections) {
        this.logger.info(
          {
            tnx: 'close',
          },
          'Closing %s pending connection%s to close the server',
          connections,
          connections !== 1 ? 's' : '',
        )

        this.connections.forEach((connection) => {
          connection.send(421, 'Server shutting down')
          connection.close()
        })
      }
      if (typeof callback === 'function') {
        callback()
      }
    }, timeout) as unknown as NodeJS.Timeout
  }

  /**
   * Authentication handler. Override this
   *
   * @param {object} auth Authentication options
   * @param {object} session Session object
   * @param {Function} callback Callback to run once the user is authenticated
   * @returns {void}
   */
  onAuth(auth: AuthData, session: Session, callback: (err: Error | null, result?: any) => void): void {
    if (auth.method === 'XOAUTH2') {
      return callback(null, {
        data: {
          status: '401',
          schemes: 'bearer mac',
          scope: 'https://mail.google.com/',
        },
      })
    }

    if (auth.method === 'XCLIENT')
      return callback(null) // pass through

    return callback(null, {
      message: 'Authentication not implemented',
    })
  }

  onConnect(session: Session, callback: () => void): void {
    setImmediate(callback)
  }

  onMailFrom(address: string, session: Session, callback: () => void): void {
    setImmediate(callback)
  }

  onRcptTo(address: string, session: Session, callback: () => void): void {
    setImmediate(callback)
  }

  onSecure(socket: Socket | TLSSocket, session: Session, callback: () => void): void {
    setImmediate(callback)
  }

  onData(stream: NodeJS.ReadableStream, session: Session, callback: () => void): void {
    let chunklen = 0

    stream.on('data', (chunk: Buffer) => {
      chunklen += chunk.length
    })

    stream.on('end', () => {
      this.logger.info(
        {
          tnx: 'message',
          size: chunklen,
        },
        '<received %s bytes>',
        chunklen,
      )
      callback()
    })
  }

  onClose(_session?: Session): void {
    // do nothing
  }

  updateSecureContext(options: Partial<SMTPServerOptions>): void {
    Object.keys(options || {}).forEach((key) => {
      this.options[key] = options[key]
    })

    const defaultTlsOptions = getTLSOptions(this.options)

    this.secureContext = new Map()
    this.secureContext.set('*', createSecureContext(defaultTlsOptions))

    const ctxMap = this.options.sniOptions || {}
    // sniOptions is either an object or a Map with domain names as keys and TLS option objects as values
    if (typeof ctxMap.get === 'function') {
      ;(ctxMap as Map<string, TLSSocketOptions>).forEach((ctx, servername) => {
        this.secureContext.set(this._normalizeHostname(servername), createSecureContext(getTLSOptions(ctx)))
      })
    }
    else {
      Object.keys(ctxMap as Record<string, TLSSocketOptions>).forEach((servername) => {
        this.secureContext.set(
          this._normalizeHostname(servername),
          createSecureContext(getTLSOptions((ctxMap as Record<string, TLSSocketOptions>)[servername])),
        )
      })
    }

    if (this.options.secure) {
      // apply changes
      Object.keys(defaultTlsOptions || {}).forEach((key) => {
        if (!(key in this.options)) {
          ;(this.options as Record<string, any>)[key] = (defaultTlsOptions as Record<string, any>)[key]
        }
      })

      // ensure SNICallback method
      if (typeof this.options.SNICallback !== 'function') {
        // create default SNI handler
        this.options.SNICallback = (servername: string, cb: (err: Error | null, ctx?: SecureContext) => void) => {
          cb(null, this.secureContext.get(servername))
        }
      }
    }
  }

  // PRIVATE METHODS

  /**
   * Setup server event handlers
   */
  private _setListeners(): void {
    const server = this.server
    server.once('listening', () => this._onListening())
    server.once('close', () => this._onClose(server))
    server.on('error', (err: Error) => this._onError(err))
  }

  /**
   * Called when server started listening
   *
   * @event
   */
  private _onListening(): void {
    const addr = this.server.address()
    const address: AddressInfo = typeof addr === 'string'
      ? { address: '0.0.0.0', port: 0, family: 'IPv4' }
      : addr || { address: '0.0.0.0', port: 0, family: 'IPv4' }

    this.logger.info(
      {
        tnx: 'listen',
        host: address.address,
        port: address.port,
        secure: !!this.options.secure,
        protocol: this.options.lmtp ? 'LMTP' : 'SMTP',
      },
      '%s%s Server listening on %s:%s',
      this.options.secure ? 'Secure ' : '',
      this.options.lmtp ? 'LMTP' : 'SMTP',
      address.family === 'IPv4' ? address.address : `[${address.address}]`,
      address.port,
    )
  }

  /**
   * Called when server is closed
   *
   * @event
   */
  private _onClose(server: Server): void {
    this.logger.info(
      {
        tnx: 'closed',
      },
      `${this.options.lmtp ? 'LMTP' : 'SMTP'} Server closed`,
    )

    if (server !== this.server) {
      // older instance was closed
      return
    }

    this.emit('close')
  }

  /**
   * Called when an error occurs with the server
   *
   * @event
   */
  private _onError(err: Error): void {
    this.emit('error', err)
  }

  private _handleProxy(socket: Socket, callback: (err: Error | null, socketOptions: SocketOptions) => void): void {
    const socketOptions: SocketOptions = {
      id: Buffer.from(randomBytes(10)).toString('base64').toLowerCase(),
    }

    if (
      !this.options.useProxy
      || (Array.isArray(this.options.useProxy) && !this.options.useProxy.includes(socket.remoteAddress || '') && !this.options.useProxy.includes('*'))
    ) {
      socketOptions.ignore = this.options.ignoredHosts?.includes(socket.remoteAddress || '') || false
      setImmediate(() => callback(null, socketOptions))
      return
    }

    const chunks: Buffer[] = []
    let chunklen = 0
    const socketReader = () => {
      let chunk: Buffer | null
      let readChunk: Buffer | null
      // eslint-disable-next-line no-cond-assign
      while ((readChunk = socket.read()) !== null) {
        chunk = readChunk
        for (let i = 0, len = chunk.length; i < len; i++) {
          const chr = chunk[i]
          if (chr === 0x0A) {
            socket.removeListener('readable', socketReader)
            chunks.push(chunk.slice(0, i + 1))
            chunklen += i + 1
            const remainder = chunk.slice(i + 1)
            if (remainder.length) {
              socket.unshift(remainder)
            }

            const header = Buffer.concat(chunks, chunklen).toString().trim()

            const params = (header || '').toString().split(' ')
            const commandName = params.shift()
            if (!commandName || commandName !== 'PROXY') {
              try {
                socket.end('* BAD Invalid PROXY header\r\n')
              }
              catch {
                // ignore
              }
              return
            }

            if (params[1]) {
              socketOptions.remoteAddress = params[1].trim().toLowerCase()

              socketOptions.ignore = this.options.ignoredHosts?.includes(socketOptions.remoteAddress) || false

              if (!socketOptions.ignore) {
                this.logger.info(
                  {
                    tnx: 'proxy',
                    cid: socketOptions.id,
                    proxy: params[1].trim().toLowerCase(),
                  },
                  '[%s] PROXY from %s through %s (%s)',
                  socketOptions.id,
                  params[1].trim().toLowerCase(),
                  params[2].trim().toLowerCase(),
                  JSON.stringify(params),
                )
              }

              if (params[3]) {
                socketOptions.remotePort = Number(params[3].trim())
              }
            }

            return callback(null, socketOptions)
          }
        }
        chunks.push(chunk)
        chunklen += chunk.length
      }
    }
    socket.on('readable', socketReader)
  }

  /**
   * Called when a new connection is established
   *
   * @event
   */
  private _onClientConnect(data: any): void {
    this.emit('connect', data)
  }

  /**
   * Normalize hostname
   *
   * @event
   */
  private _normalizeHostname(hostname: string): string {
    try {
      hostname = toUnicode((hostname || '').toString().trim()).toLowerCase()
    }
    catch (err) {
      this.logger.error(
        {
          tnx: 'punycode',
        },
        'Failed to process punycode domain "%s". error=%s',
        hostname,
        err instanceof Error ? err.message : String(err),
      )
    }

    return hostname
  }

  private _upgrade(socket: Socket, callback: (err: Error | null, tlsSocket: TLSSocket) => void): void {
    const socketOptions: TLSSocketOptions = {
      secureContext: this.secureContext.get('*'),
      isServer: true,
      server: this.server,
      SNICallback: (servername: string, cb: (err: Error | null, ctx?: SecureContext) => void) => {
        if (!this.options.SNICallback) {
          return cb(null, this.secureContext.get('*'))
        }
        this.options.SNICallback(this._normalizeHostname(servername), (err, context) => {
          if (err) {
            this.logger.error(
              {
                tnx: 'sni',
                servername,
                err,
              },
              'Failed to fetch SNI context for servername %s',
              servername,
            )
          }
          return cb(null, context || this.secureContext.get('*'))
        })
      },
    }

    let returned = false
    const onError = (err: Error) => {
      if (returned) {
        return
      }
      returned = true
      callback(err || new Error('Socket closed unexpectedly'), {} as TLSSocket)
    }

    // remove all listeners from the original socket besides the error handler
    socket.once('error', onError)

    // upgrade connection
    const tlsSocket = new TLSSocket(socket, socketOptions)

    tlsSocket.once('close', () => onError(new Error('Socket closed during TLS handshake')))
    tlsSocket.once('error', onError)
    tlsSocket.once('_tlsError', onError)
    tlsSocket.once('clientError', onError)
    tlsSocket.once('tlsClientError', onError)

    tlsSocket.on('secure', () => {
      socket.removeListener('error', onError)
      tlsSocket.removeListener('close', onError)
      tlsSocket.removeListener('error', onError)
      tlsSocket.removeListener('_tlsError', onError)
      tlsSocket.removeListener('clientError', onError)
      tlsSocket.removeListener('tlsClientError', onError)
      if (returned) {
        try {
          tlsSocket.end()
        }
        catch {
          // ignore
        }
        return
      }
      returned = true
      return callback(null, tlsSocket)
    })
  }
}

export default SMTPServer
