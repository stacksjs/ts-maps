import type { Socket } from 'node:net'
import type { CipherNameAndProtocol, SecureContext, TLSSocketOptions } from 'node:tls'
import type { AuthCallback, AuthError, AuthOptions, CommandHandler, NoArgsHandler } from './types'
import { Buffer } from 'node:buffer'
import * as crypto from 'node:crypto'
import * as dns from 'node:dns'
import { EventEmitter } from 'node:events'
import * as net from 'node:net'
import * as os from 'node:os'
import { TLSSocket } from 'node:tls'
import * as punycode from 'ts-punycode'
import { SASL } from './sasl'
import { SMTPStream } from './smtp-stream'
import { normalize } from './utils/ipv6-normalize'

const SOCKET_TIMEOUT = 60 * 1000

interface ExtendedError extends Error {
  responseCode?: number
  message: string
  code?: string
  remote?: string
}

interface SMTPServerOptions {
  secure?: boolean
  needsUpgrade?: boolean
  size?: number
  name?: string
  banner?: string
  hideSTARTTLS?: boolean
  hideSize?: boolean
  hidePIPELINING?: boolean
  hide8BITMIME?: boolean
  hideSMTPUTF8?: boolean
  authMethods: string[]
  disabledCommands: string[]
  maxAllowedUnauthenticatedCommands?: number
  useXClient?: boolean
  useXForward?: boolean
  lmtp?: boolean
  socketTimeout?: number
  allowInsecureAuth?: boolean
  maxClients?: number
  disableReverseLookup?: boolean
  authOptional?: boolean
  authRequiredMessage?: string
  [key: string]: any
}

interface SMTPServer extends EventEmitter {
  options: SMTPServerOptions
  logger: {
    info: (...args: any[]) => void
    debug: (...args: any[]) => void
    error: (...args: any[]) => void
  }
  connections: Set<SMTPConnection>
  onConnect: (session: Session, callback: (err?: ExtendedError) => void) => void
  onSecure: (socket: TLSSocket, session: Session, callback: (err?: ExtendedError) => void) => void
  onClose: (session: Session) => void
  onAuth: (auth: any, session: Session, callback: (err?: ExtendedError, response?: any) => void) => void
  onMailFrom: (parsed: ParsedAddress, session: Session, callback: (err?: ExtendedError) => void) => void
  onRcptTo: (parsed: ParsedAddress, session: Session, callback: (err?: ExtendedError) => void) => void
  onData: (stream: any, session: Session, callback: (err?: ExtendedError, message?: string) => void) => void
  secureContext: Map<string, SecureContext>
  server: net.Server
}

interface Session {
  id: string
  secure?: boolean
  transmissionType: string
  user: any
  envelope?: {
    mailFrom: ParsedAddress | false
    rcptTo: ParsedAddress[]
  }
  transaction?: number
  tlsOptions?: CipherNameAndProtocol
  servername?: string
  clientHostname?: string | false
  openingCommand?: string | false
  hostNameAppearsAs?: string | false
  xClient?: Map<string, any>
  xForward?: Map<string, any>
  error?: string
  isWizard?: boolean
  localAddress?: string
  localPort?: number
  remoteAddress?: string
  remotePort?: number
}

interface ParsedAddress {
  address: string
  args: Record<string, any>
}

interface ConnectionOptions {
  id?: string
  ignore?: boolean
  localAddress?: string
  localPort?: number
  remoteAddress?: string
  remotePort?: number
}

// Add custom type declaration for TLSSocket
declare module 'node:tls' {
  interface TLSSocket {
    servername?: string
  }
}

// Add type for SASL handler
type SASLHandler = (this: SMTPConnection, args: string[], callback: () => void) => void

/**
 * Creates a handler for new socket
 */
export class SMTPConnection extends EventEmitter implements SMTPConnection {
  public id: string
  public session: Session
  public name: string
  public _server: SMTPServer
  public _nextHandler: CommandHandler | NoArgsHandler = () => {}

  // Additional properties
  public ignore: boolean = false
  public secure: boolean = false
  public needsUpgrade: boolean = false
  public tlsOptions: false | CipherNameAndProtocol = false
  public localAddress: string = ''
  public localPort: number = 0
  public remoteAddress: string = ''
  public remotePort: number = 0
  public clientHostname: string | false = false
  public openingCommand: string | false = false
  public hostNameAppearsAs: string | false = false

  private _socket: Socket | TLSSocket
  private _transactionCounter: number = 0
  private _ready: boolean = false
  private _upgrading: boolean = false
  private _parser: SMTPStream
  private _dataStream: any = null
  private _unauthenticatedCommands: number = 0
  private _maxAllowedUnauthenticatedCommands: number | false = false
  private _unrecognizedCommands: number = 0
  private _xClient: Map<string, any> = new Map()
  private _xForward: Map<string, any> = new Map()
  private _canEmitConnection: boolean = true
  private _closing: boolean = false
  private _closed: boolean = false

  constructor(server: SMTPServer, socket: Socket | TLSSocket, options: ConnectionOptions = {}) {
    super()

    this.id = options.id || Buffer.from(crypto.randomBytes(10)).toString('base64').toLowerCase()
    this.name = server.options.name || os.hostname()
    this._server = server as unknown as SMTPServer
    this._socket = socket
    this.ignore = options.ignore || false

    // Initialize session with required fields
    this.session = {
      id: this.id,
      transmissionType: this._transmissionType(),
      user: null,
    }

    // Initialize socket properties
    this.localAddress = (options.localAddress || socket.localAddress || '').replace(/^::ffff:/, '')
    this.localPort = Number(options.localPort || socket.localPort) || 0
    this.remoteAddress = (options.remoteAddress || socket.remoteAddress || '').replace(/^::ffff:/, '')
    this.remotePort = Number(options.remotePort || socket.remotePort) || 0

    // Initialize parser
    this._parser = new SMTPStream()

    // Set initial state
    this.secure = !!server.options.secure
    this.needsUpgrade = !!server.options.needsUpgrade
    this.tlsOptions = this.secure && !this.needsUpgrade && 'getCipher' in socket ? (socket as TLSSocket).getCipher() : false

    // Normalize IPv6 addresses
    if (this.localAddress && net.isIPv6(this.localAddress))
      this.localAddress = normalize(this.localAddress)

    if (this.remoteAddress && net.isIPv6(this.remoteAddress))
      this.remoteAddress = normalize(this.remoteAddress)

    // how many messages have been processed
    this._transactionCounter = 0

    // Do not allow input from client until initial greeting has been sent
    this._ready = false

    // If true then the connection is currently being upgraded to TLS
    this._upgrading = false

    // Set handler for incoming command and handler bypass detection by command name
    this._nextHandler = () => {}

    // if currently in data mode, this stream gets the content of incoming message
    this._dataStream = false

    // Error counter - if too many commands in non-authenticated state are used, then disconnect
    this._unauthenticatedCommands = 0

    // Max allowed unauthenticated commands
    this._maxAllowedUnauthenticatedCommands = server.options.maxAllowedUnauthenticatedCommands || 10

    // Error counter - if too many invalid commands are used, then disconnect
    this._unrecognizedCommands = 0

    // Server hostname for the greetings
    this.name = server.options.name || os.hostname()

    // Resolved hostname for remote IP address
    this.clientHostname = false

    // The opening SMTP command (HELO, EHLO or LHLO)
    this.openingCommand = false

    // The hostname client identifies itself with
    this.hostNameAppearsAs = false

    // increment connection count
    this._closing = false
    this._closed = false
  }

  /**
   * Initiates the connection. Checks connection limits and reverse resolves client hostname. The client
   * is not allowed to send anything before init has finished otherwise 'You talk too soon' error is returned
   */
  init(): void {
    // Setup event handlers for the socket
    this._setListeners(() => {
      // Check that connection limit is not exceeded
      if (this._server.options.maxClients && this._server.connections.size > this._server.options.maxClients) {
        return this.send(421, `${this.name} Too many connected clients, try again in a moment`)
      }

      // Keep a small delay for detecting early talkers
      setTimeout(() => this.connectionReady(), 100)
    })
  }

  connectionReady(next?: () => void): void {
    // Resolve hostname for the remote IP
    const reverseCb = (err: Error | null, hostnames?: string[]) => {
      if (err) {
        this._server.logger.error(
          {
            tnx: 'connection',
            cid: this.id,
            host: this.remoteAddress,
            hostname: this.clientHostname,
            err,
          },
          'Reverse resolve for %s: %s',
          this.remoteAddress,
          err.message,
        )
        // ignore resolve error
      }

      if (this._closing || this._closed) {
        return
      }

      this.clientHostname = (hostnames && hostnames[0]) || `[${this.remoteAddress}]`

      this._resetSession()

      const onSecureIfNeeded = (next: () => void) => {
        if (!this.session.secure) {
          // no TLS
          return next()
        }

        const tlsSocket = this._socket as TLSSocket
        this.session.servername = tlsSocket.servername
        this._server.onSecure(tlsSocket, this.session, (err) => {
          if (err) {
            return this._onError(err)
          }
          next()
        })
      }

      this._server.onConnect(this.session, (err) => {
        this._server.logger.info(
          {
            tnx: 'connection',
            cid: this.id,
            host: this.remoteAddress,
            hostname: this.clientHostname,
          },
          'Connection from %s',
          this.clientHostname,
        )

        if (err) {
          this.send(err.responseCode || 554, err.message)
          return this.close()
        }

        onSecureIfNeeded(() => {
          this._ready = true // Start accepting data from input

          if (!this._server.options.useXClient && !this._server.options.useXForward) {
            this.emitConnection()
          }

          this.send(
            220,
            `${this.name} ${this._server.options.lmtp ? 'LMTP' : 'ESMTP'}${this._server.options.banner ? ` ${this._server.options.banner}` : ''}`,
          )

          if (typeof next === 'function') {
            next()
          }
        })
      })
    }

    // Skip reverse name resolution if disabled.
    if (this._server.options.disableReverseLookup) {
      return reverseCb(null, [])
    }

    // also make sure that we do not wait too long over the reverse resolve call
    let greetingSent = false
    const reverseTimer = setTimeout(() => {
      clearTimeout(reverseTimer)
      if (greetingSent) {
        return
      }
      greetingSent = true
      reverseCb(new Error('Timeout'), [])
    }, 1500)

    try {
      // dns.reverse throws on invalid input, see https://github.com/nodejs/node/issues/3112
      dns.reverse(this.remoteAddress.toString(), (err: Error | null, hostnames?: string[]) => {
        clearTimeout(reverseTimer)
        if (greetingSent) {
          return
        }
        greetingSent = true
        reverseCb(err, hostnames)
      })
    }
    catch (E) {
      clearTimeout(reverseTimer)
      if (greetingSent) {
        return
      }
      greetingSent = true
      reverseCb(E as Error, [])
    }
  }

  /**
   * Send data to socket
   *
   * @param {number} code Response code
   * @param {string | Array} data If data is Array, send a multi-line response
   */
  send(code: number, data: string | string[]): void {
    let payload: string

    if (Array.isArray(data)) {
      payload = data.map((line, i, arr) => code + (i < arr.length - 1 ? '-' : ' ') + line).join('\r\n')
    }
    else {
      payload = `${String(code)} ${data || ''}`
    }

    if (code >= 400) {
      this.session.error = payload
    }

    // Ref. https://datatracker.ietf.org/doc/html/rfc4954#section-4
    if (code === 334 && payload === '334') {
      payload += ' '
    }

    if (this._socket && !this._socket.destroyed && this._socket.readyState === 'open') {
      this._socket.write(`${payload}\r\n`)
      this._server.logger.debug(
        {
          tnx: 'send',
          cid: this.id,
          user: (this.session.user && this.session.user.username) || this.session.user,
        },
        'S:',
        payload,
      )
    }

    if (code === 421) {
      this.close()
    }
  }

  /**
   * Close socket
   */
  close(): void {
    if (!this._socket.destroyed && this._socket.writable) {
      this._socket.end()
    }

    this._server.connections.delete(this)

    this._closing = true
  }

  // PRIVATE METHODS

  /**
   * Setup socket event handlers
   */
  _setListeners(callback: () => void): void {
    this._socket.on('close', (hadError: boolean) => this._onCloseEvent(hadError))
    this._socket.on('error', (err: Error) => this._onError(err))
    this._socket.setTimeout(this._server.options.socketTimeout || SOCKET_TIMEOUT, () => this._onTimeout())
    this._socket.pipe(this._parser)
    if (!this.needsUpgrade) {
      return callback()
    }
    this.upgrade(() => false, callback)
  }

  _onCloseEvent(hadError: boolean): void {
    this._server.logger.info(
      {
        tnx: 'close',
        cid: this.id,
        host: this.remoteAddress,
        user: (this.session.user && this.session.user.username) || this.session.user,
        hadError,
      },
      '%s received "close" event from %s%s',
      this.id,
      this.remoteAddress,
      hadError ? ' after error' : '',
    )

    this._onClose()
  }

  /**
   * Fired when the socket is closed
   * @event
   */
  _onClose(): void {
    if (this._parser) {
      this._parser.isClosed = true
      this._socket.unpipe(this._parser)
      this._parser = new SMTPStream() // Reset to new instance instead of undefined
    }

    if (this._dataStream) {
      this._dataStream.unpipe()
      this._dataStream = null
    }

    this._server.connections.delete(this)

    if (this._closed) {
      return
    }

    this._closed = true
    this._closing = false

    this._server.logger.info(
      {
        tnx: 'close',
        cid: this.id,
        host: this.remoteAddress,
        user: (this.session.user && this.session.user.username) || this.session.user,
      },
      'Connection closed to %s',
      this.clientHostname || this.remoteAddress,
    )
    this._server.onClose(this.session)
  }

  /**
   * Fired when an error occurs with the socket
   *
   * @event
   * @param {Error} err Error object
   */
  _onError(err: ExtendedError): void {
    err.remote = this.remoteAddress
    this._server.logger.error(
      {
        err,
        tnx: 'error',
        user: (this.session.user && this.session.user.username) || this.session.user,
      },
      '%s %s %s',
      this.id,
      this.remoteAddress,
      err.message,
    )

    if ((err.code === 'ECONNRESET' || err.code === 'EPIPE') && (!this.session.envelope || !this.session.envelope.mailFrom)) {
      // We got a connection error outside transaction. In most cases it means dirty
      // connection ending by the other party, so we can just ignore it
      this.close() // mark connection as 'closing'
      return
    }

    this.emit('error', err)
  }

  /**
   * Fired when socket timeouts. Closes connection
   *
   * @event
   */
  _onTimeout(): void {
    this.send(421, 'Timeout - closing connection')
  }

  /**
   * Checks if a selected command is available and ivokes it
   *
   * @param {Buffer} command Single line of data from the client
   * @param {Function} callback Callback to run once the command is processed
   */
  _onCommand(command: Buffer, callback?: () => void): void {
    const commandName = (command || '').toString().split(' ').shift()?.toUpperCase() || ''
    this._server.logger.debug(
      {
        tnx: 'command',
        cid: this.id,
        command: commandName,
        user: (this.session.user && this.session.user.username) || this.session.user,
      },
      'C:',
      (command || '').toString(),
    )

    let handler: ((command: Buffer, callback?: () => void) => void) | undefined

    if (!this._ready) {
      // block spammers that send payloads before server greeting
      return this.send(421, `${this.name} You talk too soon`)
    }

    const defaultCallback = () => {}
    callback = callback || defaultCallback

    if (this._upgrading) {
      // ignore any commands before TLS upgrade is finished
      callback()
      return
    }

    if (typeof this._nextHandler === 'function') {
      // If we already have a handler method queued up then use this
      this._nextHandler(command, callback)
      this._nextHandler = defaultCallback
      return
    }

    // detect handler from the command name
    const handlerName = `handler_${commandName}` as keyof this
    if (this._isSupported(commandName)) {
      handler = this[handlerName] as ((command: Buffer, callback?: () => void) => void)
    }

    if (!handler) {
      // if the user makes more
      this._unrecognizedCommands++
      if (this._unrecognizedCommands >= 10) {
        return this.send(421, 'Error: too many unrecognized commands')
      }

      this.send(500, 'Error: command not recognized')
      callback()
      return
    }

    // block users that try to fiddle around without logging in
    if (
      !this.session.user
      && this._isSupported('AUTH')
      && !this._server.options.authOptional
      && commandName !== 'AUTH'
      && this._maxAllowedUnauthenticatedCommands !== false
    ) {
      this._unauthenticatedCommands++
      if (this._unauthenticatedCommands >= this._maxAllowedUnauthenticatedCommands) {
        return this.send(421, 'Error: too many unauthenticated commands')
      }
    }

    if (!this.hostNameAppearsAs && commandName && ['MAIL', 'RCPT', 'DATA', 'AUTH'].includes(commandName)) {
      this.send(503, `Error: send ${this._server.options.lmtp ? 'LHLO' : 'HELO/EHLO'} first`)
      callback()
      return
    }

    // Check if authentication is required
    if (!this.session.user && this._isSupported('AUTH') && ['MAIL', 'RCPT', 'DATA'].includes(commandName) && !this._server.options.authOptional) {
      this.send(
        530,
        typeof this._server.options.authRequiredMessage === 'string' ? this._server.options.authRequiredMessage : 'Error: authentication Required',
      )
      callback()
      return
    }

    handler.call(this, command, callback)
  }

  /**
   * Checks that a command is available and is not listed in the disabled commands array
   *
   * @param {string} command Command name
   * @returns {boolean} Returns true if the command can be used
   */
  _isSupported(command: string): boolean {
    command = (command || '').toString().trim().toUpperCase()
    const handlerName = `handler_${command}` as keyof this
    return !this._server.options.disabledCommands.includes(command) && typeof this[handlerName] === 'function'
  }

  /**
   * Parses commands like MAIL FROM and RCPT TO. Returns an object with the address and optional arguments.
   *
   * @param {[type]} name Address type, eg 'mail from' or 'rcpt to'
   * @param {[type]} command Data payload to parse
   * @returns {object | boolean} Parsed address in the form of {address:, args: {}} or false if parsing failed
   */
  _parseAddressCommand(name: string, command: string): { address: string, args: Record<string, any> } | false {
    command = (command || '').toString()
    name = (name || '').toString().trim().toUpperCase()

    const commandParts = command.split(':')
    const commandName = commandParts[0]?.trim().toUpperCase() || ''
    const restParts = commandParts.slice(1).join(':').trim().split(/\s+/)

    let address = restParts[0] || ''
    const args: Record<string, any> = {}
    let invalid = false

    if (name !== commandName) {
      return false
    }

    if (!/^<[^<>]*>$/.test(address)) {
      invalid = true
    }
    else {
      address = address.substr(1, address.length - 2)
    }

    for (const part of restParts.slice(1)) {
      const [key, ...valueParts] = part.split('=')
      const upperKey = key.toUpperCase()
      let value = valueParts.join('=') || true

      if (typeof value === 'string') {
        // decode 'xtext'
        value = value.replace(/\+([0-9A-F]{2})/g, (_match: string, hex: string) => unescape(`%${hex}`))
      }

      args[upperKey] = value
    }

    if (address) {
      // enforce unycode
      const addressParts = address.split('@')
      if (addressParts.length !== 2 || !addressParts[0] || !addressParts[1]) {
        // really bad e-mail address validation. was not able to use joi because of the missing unicode support
        invalid = true
      }
      else {
        try {
          const localPart = addressParts[0]
          const domain = addressParts[1]
          address = `${localPart}@${punycode.toUnicode(domain)}`
        }
        catch (err) {
          this._server.logger.error(
            {
              tnx: 'punycode',
              cid: this.id,
              user: (this.session.user && this.session.user.username) || this.session.user,
            },
            'Failed to process punycode domain "%s". error=%s',
            addressParts[1],
            err instanceof Error ? err.message : String(err),
          )
          const localPart = addressParts[0]
          const domain = addressParts[1]
          address = `${localPart}@${domain}`
        }
      }
    }

    return invalid
      ? false
      : {
          address: address || '',
          args,
        }
  }

  /**
   * Resets or sets up a new session. We reuse existing session object to keep
   * application specific data.
   */
  _resetSession(): void {
    const session = this.session

    // reset data that might be overwritten
    session.id = this.id
    session.user = null
    session.transmissionType = this._transmissionType()
    session.localAddress = this.localAddress
    session.localPort = this.localPort
    session.remoteAddress = this.remoteAddress
    session.remotePort = this.remotePort
    session.clientHostname = this.clientHostname
    session.openingCommand = this.openingCommand
    session.hostNameAppearsAs = this.hostNameAppearsAs
    session.xClient = this._xClient
    session.xForward = this._xForward
    session.transmissionType = this._transmissionType()

    session.tlsOptions = this.tlsOptions || undefined

    // reset transaction properties
    session.envelope = {
      mailFrom: false,
      rcptTo: [],
    }

    session.transaction = this._transactionCounter + 1
  }

  /**
   * Returns current transmission type
   *
   * @return {string} Transmission type
   */
  _transmissionType(): string {
    let type = this._server.options.lmtp ? 'LMTP' : 'SMTP'

    if (this.openingCommand === 'EHLO') {
      type = `E${type}`
    }

    if (this.secure) {
      type += 'S'
    }

    if (this.session.user) {
      type += 'A'
    }

    return type
  }

  emitConnection(): void {
    if (!this._canEmitConnection)
      return

    this._canEmitConnection = false
    this.emit('connect', {
      id: this.id,
      localAddress: this.localAddress,
      localPort: this.localPort,
      remoteAddress: this.remoteAddress,
      remotePort: this.remotePort,
      hostNameAppearsAs: this.hostNameAppearsAs,
      clientHostname: this.clientHostname,
    })
  }

  // COMMAND HANDLERS

  /**
   * Processes EHLO. Requires valid hostname as the single argument.
   */
  handler_EHLO(command: Buffer, callback: () => void): void {
    const parts = command.toString().trim().split(/\s+/)
    const hostname = parts[1] || ''

    if (parts.length !== 2) {
      this.send(501, `Error: syntax: ${this._server.options.lmtp ? 'LHLO' : 'EHLO'} hostname`)
      return callback()
    }

    this.hostNameAppearsAs = hostname.toLowerCase()

    const features = ['PIPELINING', '8BITMIME', 'SMTPUTF8'].filter(feature => !this._server.options[`hide${feature}`])

    if (this._server.options.authMethods.length && this._isSupported('AUTH') && !this.session.user) {
      features.push(['AUTH'].concat(this._server.options.authMethods).join(' '))
    }

    if (!this.secure && this._isSupported('STARTTLS') && !this._server.options.hideSTARTTLS) {
      features.push('STARTTLS')
    }

    if (this._server.options.size) {
      features.push(`SIZE${this._server.options.hideSize ? '' : ` ${this._server.options.size}`}`)
    }

    // XCLIENT ADDR removes any special privileges for the client
    if (!this._xClient.has('ADDR') && this._server.options.useXClient && this._isSupported('XCLIENT')) {
      features.push('XCLIENT NAME ADDR PORT PROTO HELO LOGIN')
    }

    // If client has already issued XCLIENT ADDR then it does not have privileges for XFORWARD anymore
    if (!this._xClient.has('ADDR') && this._server.options.useXForward && this._isSupported('XFORWARD')) {
      features.push('XFORWARD NAME ADDR PORT PROTO HELO IDENT SOURCE')
    }

    this._resetSession() // EHLO is effectively the same as RSET
    this.send(250, [`${this.name} Nice to meet you, ${this.clientHostname}`].concat(features || []))

    callback()
  }

  /**
   * Processes HELO. Requires valid hostname as the single argument.
   */
  handler_HELO(command: Buffer, callback: () => void): void {
    const parts = command.toString().trim().split(/\s+/)
    const hostname = parts[1] || ''

    if (parts.length !== 2) {
      this.send(501, 'Error: syntax: HELO hostname')
      return callback()
    }

    this.hostNameAppearsAs = hostname.toLowerCase()

    this._resetSession() // HELO is effectively the same as RSET
    this.send(250, `${this.name} Nice to meet you, ${this.clientHostname}`)

    callback()
  }

  /**
   * Processes QUIT. Closes the connection
   */
  handler_QUIT(command: Buffer, callback: () => void): void {
    this.send(221, 'Bye')
    this.close()
    callback()
  }

  /**
   * Processes NOOP. Does nothing but keeps the connection alive
   */
  handler_NOOP(command: Buffer, callback: () => void): void {
    this.send(250, 'OK')
    callback()
  }

  /**
   * Processes RSET. Resets user and session info
   */
  handler_RSET(command: Buffer, callback: () => void): void {
    this._resetSession()
    this.send(250, 'Flushed')
    callback()
  }

  /**
   * Processes HELP. Responds with url to RFC
   */
  handler_HELP(command: Buffer, callback: () => void): void {
    this.send(214, 'See https://tools.ietf.org/html/rfc5321 for details')
    callback()
  }

  /**
   * Processes VRFY. Does not verify anything
   */
  handler_VRFY(command: Buffer, callback: () => void): void {
    this.send(252, 'Try to send something. No promises though')
    callback()
  }

  /**
   * Overrides connection info
   * http://www.postfix.org/XCLIENT_README.html
   *
   * TODO: add unit tests
   */
  handler_XCLIENT(command: Buffer, callback: () => void): void {
    // check if user is authorized to perform this command
    if (this._xClient.has('ADDR') || !this._server.options.useXClient) {
      this.send(550, 'Error: Not allowed')
      return callback()
    }

    // not allowed to change properties if already processing mail
    if (this.session.envelope?.mailFrom) {
      this.send(503, 'Error: Mail transaction in progress')
      return callback()
    }

    const allowedKeys = ['NAME', 'ADDR', 'PORT', 'PROTO', 'HELO', 'LOGIN']
    const parts = command.toString().trim().split(/\s+/)
    const data = new Map<string, string | boolean | number>()
    parts.shift() // remove XCLIENT prefix

    if (!parts.length) {
      this.send(501, 'Error: Bad command parameter syntax')
      return callback()
    }

    let loginValue: string | false = false
    let portValue: number

    // parse and validate arguments
    for (let i = 0, len = parts.length; i < len; i++) {
      const [key, ...valueParts] = parts[i].split('=')
      const upperKey = (key || '').toUpperCase()

      if (valueParts.length !== 1 || !allowedKeys.includes(upperKey)) {
        this.send(501, 'Error: Bad command parameter syntax')
        return callback()
      }

      let value = valueParts[0] || ''

      // value is xtext
      if (typeof value === 'string') {
        value = value.replace(/\+([0-9A-F]{2})/g, (_match: string, hex: string) => unescape(`%${hex}`))
      }

      if (typeof value === 'string' && ['[UNAVAILABLE]', '[TEMPUNAVAIL]'].includes(value.toUpperCase())) {
        value = ''
      }

      if (data.has(upperKey)) {
        // ignore duplicate keys
        continue
      }

      data.set(upperKey, value)

      switch (upperKey) {
        case 'LOGIN':
          loginValue = typeof value === 'string' ? value : false
          break
        case 'ADDR':
          if (typeof value === 'string' && value) {
            value = value.replace(/^IPV6:/i, '') // IPv6 addresses are prefixed with "IPv6:"

            if (!net.isIP(value)) {
              this.send(501, 'Error: Bad command parameter syntax. Invalid address')
              return callback()
            }

            if (net.isIPv6(value)) {
              value = normalize(value)
            }

            this._server.logger.info(
              {
                tnx: 'xclient',
                cid: this.id,
                xclientKey: 'ADDR',
                xclient: value,
                user: (this.session.user && this.session.user.username) || this.session.user,
              },
              'XCLIENT from %s through %s',
              value,
              this.remoteAddress,
            )

            // store original value for reference as ADDR:DEFAULT
            if (!this._xClient.has('ADDR:DEFAULT')) {
              this._xClient.set('ADDR:DEFAULT', this.remoteAddress)
            }

            this.remoteAddress = value
            this.hostNameAppearsAs = false // reset client provided hostname, require HELO/EHLO
          }
          break
        case 'NAME':
          if (typeof value === 'string') {
            this._server.logger.info(
              {
                tnx: 'xclient',
                cid: this.id,
                xclientKey: 'NAME',
                xclient: value,
                user: (this.session.user && this.session.user.username) || this.session.user,
              },
              'XCLIENT hostname resolved as "%s"',
              value,
            )

            // store original value for reference as NAME:DEFAULT
            if (!this._xClient.has('NAME:DEFAULT')) {
              this._xClient.set('NAME:DEFAULT', this.clientHostname || '')
            }

            this.clientHostname = value.toLowerCase()
          }
          break
        case 'PORT':
          portValue = Number(value)
          if (!Number.isNaN(portValue)) {
            this._server.logger.info(
              {
                tnx: 'xclient',
                cid: this.id,
                xclientKey: 'PORT',
                xclient: portValue,
                user: (this.session.user && this.session.user.username) || this.session.user,
              },
              'XCLIENT remote port resolved as "%s"',
              portValue,
            )

            // store original value for reference as NAME:DEFAULT
            if (!this._xClient.has('PORT:DEFAULT')) {
              this._xClient.set('PORT:DEFAULT', this.remotePort || '')
            }

            this.remotePort = portValue
          }
          break
        default:
          // other values are not relevant
      }
      this._xClient.set(upperKey, value)
    }

    const checkLogin = async () => {
      if (typeof loginValue !== 'string') {
        return
      }
      if (!loginValue) {
        // clear authentication session?
        this._server.logger.info(
          {
            tnx: 'deauth',
            cid: this.id,
            user: (this.session.user && this.session.user.username) || this.session.user,
          },
          'User deauthenticated using %s',
          'XCLIENT',
        )
        this.session.user = false
        return
      }
      const method = 'SASL_XCLIENT'
      try {
        await new Promise<void>((resolve, reject) => {
          SASL[method].call(this, [loginValue], (err?: Error) => {
            if (err)
              reject(err)
            else resolve()
          })
        })
      }
      catch (err) {
        this.send(550, err instanceof Error ? err.message : String(err))
        this.close()
      }
    }

    // Use [ADDR] if NAME was empty
    if (this.remoteAddress && !this.clientHostname) {
      this.clientHostname = `[${this.remoteAddress}]`
    }

    if (data.has('ADDR')) {
      this.emitConnection()
    }

    checkLogin().then(() => {
      // success
      this.send(
        220,
        `${this.name} ${this._server.options.lmtp ? 'LMTP' : 'ESMTP'}${this._server.options.banner ? ` ${this._server.options.banner}` : ''}`,
      )
      callback()
    }).catch(() => {
      // Error already handled in checkLogin
    })
  }

  /**
   * Processes XFORWARD data
   * http://www.postfix.org/XFORWARD_README.html
   *
   * TODO: add unit tests
   */
  handler_XFORWARD(command: Buffer, callback: () => void): void {
    // check if user is authorized to perform this command
    if (!this._server.options.useXForward) {
      this.send(550, 'Error: Not allowed')
      return callback()
    }

    // not allowed to change properties if already processing mail
    if (this.session.envelope?.mailFrom) {
      this.send(503, 'Error: Mail transaction in progress')
      return callback()
    }

    const allowedKeys = ['NAME', 'ADDR', 'PORT', 'PROTO', 'HELO', 'IDENT', 'SOURCE']
    const parts = command.toString().trim().split(/\s+/)
    let key, value
    const data = new Map<string, string | boolean | number>()
    let hasAddr = false
    parts.shift() // remove XFORWARD prefix

    if (!parts.length) {
      this.send(501, 'Error: Bad command parameter syntax')
      return callback()
    }

    // parse and validate arguments
    for (let i = 0, len = parts.length; i < len; i++) {
      value = parts[i].split('=')
      key = value.shift()
      if (value.length !== 1 || !allowedKeys.includes(key?.toUpperCase() || '')) {
        this.send(501, 'Error: Bad command parameter syntax')
        return callback()
      }
      key = key?.toUpperCase() || ''
      if (data.has(key)) {
        // ignore duplicate keys
        continue
      }

      // value is xtext
      value = (value[0] || '').replace(/\+([0-9A-F]{2})/g, (match, hex) => unescape(`%${hex}`))

      if (typeof value === 'string') {
        if (value.toUpperCase() === '[UNAVAILABLE]') {
          value = ''
        }

        if (key === 'ADDR' && value) {
          value = value.replace(/^IPV6:/i, '')

          if (!net.isIP(value)) {
            this.send(501, 'Error: Bad command parameter syntax. Invalid address')
            return callback()
          }

          if (net.isIPv6(value)) {
            value = normalize(value)
          }

          this._server.logger.info(
            {
              tnx: 'xforward',
              cid: this.id,
              xforwardKey: 'ADDR',
              xforward: value,
              user: (this.session.user && this.session.user.username) || this.session.user,
            },
            'XFORWARD from %s through %s',
            value,
            this.remoteAddress,
          )

          // store original value for reference as ADDR:DEFAULT
          if (!this._xClient.has('ADDR:DEFAULT')) {
            this._xClient.set('ADDR:DEFAULT', this.remoteAddress)
          }

          hasAddr = true
          this.remoteAddress = value
        }
        if (key === 'NAME') {
          this.clientHostname = value.toLowerCase()
        }
      }

      if (data.has(key)) {
        // ignore duplicate keys
        continue
      }

      data.set(key, value)

      this._xForward.set(key, value)
    }

    if (hasAddr) {
      this._canEmitConnection = true
      this.emitConnection()
    }

    // success
    this.send(250, 'OK')
    callback()
  }

  /**
   * Upgrades connection to TLS if possible
   */
  handler_STARTTLS(command: Buffer, callback: () => void): void {
    if (this.secure) {
      this.send(503, 'Error: TLS already active')
      return callback()
    }

    this.send(220, 'Ready to start TLS')

    this.upgrade(callback)
  }

  /**
   * Check if selected authentication is available and delegate auth data to SASL
   */
  handler_AUTH(command: Buffer, callback: () => void): void {
    const args = command.toString().trim().split(/\s+/)
    const method = (args.shift() || '').toString().toUpperCase()
    const methodKey = `SASL_${method}` as keyof typeof SASL
    const handler = SASL[methodKey] as SASLHandler | undefined

    if (!this.secure && this._isSupported('STARTTLS') && !this._server.options.hideSTARTTLS && !this._server.options.allowInsecureAuth) {
      this.send(538, 'Error: Must issue a STARTTLS command first')
      return callback()
    }

    if (this.session.user) {
      this.send(503, 'Error: No identity changes permitted')
      return callback()
    }

    if (!this._server.options.authMethods.includes(method) || !handler) {
      this.send(504, 'Error: Unrecognized authentication type')
      return callback()
    }

    // Use proper type casting for handler binding
    handler.call(this as unknown as SMTPConnection, args.slice(1), callback)
  }

  /**
   * Processes MAIL FROM command, parses address and extra arguments
   */
  handler_MAIL(command: Buffer, callback: () => void): void {
    const parsed = this._parseAddressCommand('mail from', command.toString())

    // in case we still haven't informed about the new connection emit it
    this.emitConnection()

    // sender address can be empty, so we only check if parsing failed or not
    if (!parsed) {
      this.send(501, 'Error: Bad sender address syntax')
      return callback()
    }

    if (this.session.envelope?.mailFrom) {
      this.send(503, 'Error: nested MAIL command')
      return callback()
    }

    if (!this._server.options.hideSize && this._server.options.size && parsed.args.SIZE && Number(parsed.args.SIZE) > this._server.options.size) {
      this.send(552, `Error: message exceeds fixed maximum message size ${this._server.options.size}`)
      return callback()
    }

    this._server.onMailFrom(parsed, this.session, (err) => {
      if (err) {
        this.send(err.responseCode || 550, err.message)
        return callback()
      }

      if (this.session.envelope) {
        this.session.envelope.mailFrom = parsed
      }

      this.send(250, 'Accepted')
      callback()
    })
  }

  /**
   * Processes RCPT TO command, parses address and extra arguments
   */
  handler_RCPT(command: Buffer, callback: () => void): void {
    const parsed = this._parseAddressCommand('rcpt to', command.toString())

    // recipient address can not be empty
    if (!parsed || !parsed.address) {
      this.send(501, 'Error: Bad recipient address syntax')
      return callback()
    }

    if (!this.session.envelope?.mailFrom) {
      this.send(503, 'Error: need MAIL command')
      return callback()
    }

    this._server.onRcptTo(parsed, this.session, (err) => {
      if (err) {
        this.send(err.responseCode || 550, err.message)
        return callback()
      }

      if (this.session.envelope?.rcptTo) {
        for (let i = 0, len = this.session.envelope.rcptTo.length; i < len; i++) {
          const existingAddr = this.session.envelope.rcptTo[i]
          if (existingAddr.address.toLowerCase() === parsed.address.toLowerCase()) {
            this.session.envelope.rcptTo[i] = parsed
            return
          }
        }
        this.session.envelope.rcptTo.push(parsed)
      }

      this.send(250, 'Accepted')
      callback()
    })
  }

  /**
   * Processes DATA by forwarding incoming stream to the onData handler
   */
  handler_DATA(command: Buffer, callback: () => void): void {
    if (!this.session.envelope?.rcptTo.length) {
      this.send(503, 'Error: need RCPT command')
      return callback()
    }

    if (!this._parser) {
      return callback()
    }

    this._dataStream = this._parser.startDataMode(this._server.options.size)

    const close = (err: ExtendedError | null, message: string | ExtendedError[]) => {
      const rcptCount = this.session.envelope?.rcptTo?.length || 0

      if (err) {
        if (this._server.options.lmtp) {
          for (let i = 0; i < rcptCount; i++) {
            this.send(err.responseCode || 450, err.message)
          }
        }
        else {
          this.send(err.responseCode || 450, err.message)
        }
      }
      else if (Array.isArray(message)) {
        message.forEach((response) => {
          if (response instanceof Error) {
            this.send(response.responseCode || 450, response.message)
          }
          else {
            this.send(250, typeof response === 'string' ? response : 'OK: message accepted')
          }
        })
      }
      else if (this._server.options.lmtp) {
        for (let i = 0; i < rcptCount; i++) {
          this.send(250, typeof message === 'string' ? message : 'OK: message accepted')
        }
      }
      else {
        this.send(250, typeof message === 'string' ? message : 'OK: message queued')
      }

      this._transactionCounter++

      this._unrecognizedCommands = 0 // reset unrecognized commands counter
      this._resetSession() // reset session state

      if (typeof this._parser === 'object' && this._parser) {
        this._parser.continue()
      }
    }

    this._server.onData(this._dataStream, this.session, (err?: ExtendedError, message?: string | ExtendedError[]) => {
      if (typeof this._dataStream === 'object' && this._dataStream && this._dataStream.readable) {
        this._dataStream.on('end', () => close(err || null, message || ''))
        return
      }
      close(err || null, message || '')
    })

    this.send(354, 'End data with <CR><LF>.<CR><LF>')
    callback()
  }

  // Dummy handlers for some old sendmail specific commands

  /**
   * Processes sendmail WIZ command, upgrades to "wizard mode"
   */
  handler_WIZ(command: Buffer, callback: () => void): void {
    const args = command.toString().trim().split(/\s+/)
    args.shift() // remove WIZ
    const password = (args.shift() || '').toString()

    // require password argument
    if (!password) {
      this.send(500, 'You are no wizard!')
      return callback()
    }

    // all passwords pass validation, so everyone is a wizard!
    this.session.isWizard = true
    this.send(200, 'Please pass, oh mighty wizard')
    callback()
  }

  /**
   * Processes sendmail SHELL command, should return interactive shell but this is a dummy function
   * so no actual shell is provided to the client
   */
  handler_SHELL(command: Buffer, callback: () => void): void {
    this._server.logger.info(
      {
        tnx: 'shell',
        cid: this.id,
        user: (this.session.user && this.session.user.username) || this.session.user,
      },
      'Client tried to invoke SHELL',
    )

    if (!this.session.isWizard) {
      this.send(500, 'Mere mortals must not mutter that mantra')
      return callback()
    }

    this.send(500, 'Error: Invoking shell is not allowed. This incident will be reported.')
    callback()
  }

  /**
   * Processes sendmail KILL command
   */
  handler_KILL(command: Buffer, callback: () => void): void {
    this._server.logger.info(
      {
        tnx: 'kill',
        cid: this.id,
        user: (this.session.user && this.session.user.username) || this.session.user,
      },
      'Client tried to invoke KILL',
    )

    this.send(500, 'Can not kill Mom')
    callback()
  }

  upgrade(callback: () => void, secureCallback?: () => void): void {
    this._socket.unpipe(this._parser)
    this._upgrading = true
    setImmediate(callback) // resume input stream

    const secureContext = this._server.secureContext.get('*')
    const socketOptions: TLSSocketOptions = {
      secureContext,
      isServer: true,
      server: this._server.server,
      SNICallback: this._server.options.SNICallback,
    }

    // Apply additional socket options if these are set in the server options
    ;(['requestCert', 'rejectUnauthorized', 'ALPNProtocols', 'SNICallback', 'session', 'requestOCSP'] as const).forEach((key) => {
      if (key in this._server.options) {
        socketOptions[key] = this._server.options[key]
      }
    })

    // remove all listeners from the original socket besides the error handler
    this._socket.removeAllListeners()
    this._socket.on('error', err => this._onError(err))

    // upgrade connection
    const secureSocket = new TLSSocket(this._socket, socketOptions)

    secureSocket.once('close', hadError => this._onCloseEvent(hadError))
    secureSocket.once('error', err => this._onError(err))
    secureSocket.once('_tlsError', err => this._onError(err))
    secureSocket.once('clientError', err => this._onError(err))

    secureSocket.setTimeout(this._server.options.socketTimeout || SOCKET_TIMEOUT, () => this._onTimeout())

    secureSocket.on('secure', () => {
      this.session.secure = this.secure = true
      this._socket = secureSocket
      this._upgrading = false

      this.session.tlsOptions = this.tlsOptions = secureSocket.getCipher()
      this.session.servername = secureSocket.servername
      const cipher = this.session.tlsOptions && this.session.tlsOptions.name
      this._server.logger.info(
        {
          tnx: 'starttls',
          cid: this.id,
          user: (this.session.user && this.session.user.username) || this.session.user,
          cipher,
        },
        'Connection upgraded to TLS using',
        cipher || 'N/A',
      )
      this._server.onSecure(secureSocket, this.session, (err) => {
        if (err) {
          return this._onError(err)
        }
        this._socket.pipe(this._parser)
        if (typeof secureCallback === 'function') {
          secureCallback()
        }
      })
    })
  }

  // Update onAuth callback type
  _onAuth(auth: AuthOptions, session: Session, callback: AuthCallback): void {
    this._server.onAuth(auth, session, (err?: ExtendedError, response?: any) => {
      callback(err as AuthError | null, response)
    })
  }
}

export default SMTPConnection
