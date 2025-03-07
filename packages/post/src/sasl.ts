import type { SMTPConnection } from './smtp-connection'
import { Buffer } from 'node:buffer'
import { createHmac } from 'node:crypto'

export const SASL = {
  SASL_PLAIN(this: SMTPConnection, args: string[], callback: () => void): void {
    if (args.length > 1) {
      this.send(501, 'Error: syntax: AUTH PLAIN token')
      return callback()
    }

    if (!args.length) {
      this._nextHandler = (command: Buffer, cb?: () => void) => {
        SASL.PLAIN_token.call(this, true, command.toString(), cb || (() => {}))
      }
      this.send(334, '')

      return callback()
    }

    SASL.PLAIN_token.call(this, false, args[0], callback)
  },

  SASL_LOGIN(this: SMTPConnection, args: string[], callback: () => void): void {
    if (args.length > 1) {
      this.send(501, 'Error: syntax: AUTH LOGIN')
      return callback()
    }

    if (!args.length) {
      this._nextHandler = (command: Buffer, cb?: () => void) => {
        SASL.LOGIN_username.call(this, true, command.toString(), cb || (() => {}))
      }
      this.send(334, 'VXNlcm5hbWU6')

      return callback()
    }

    SASL.LOGIN_username.call(this, false, args[0], callback)
  },

  SASL_XOAUTH2(this: SMTPConnection, args: string[], callback: () => void): void {
    if (args.length > 1) {
      this.send(501, 'Error: syntax: AUTH XOAUTH2 token')
      return callback()
    }

    if (!args.length) {
      this._nextHandler = (command: Buffer, cb?: () => void) => {
        SASL.XOAUTH2_token.call(this, true, command.toString(), cb || (() => {}))
      }
      this.send(334, '')
      return callback()
    }

    SASL.XOAUTH2_token.call(this, false, args[0], callback)
  },

  'SASL_CRAM-MD5': function (this: SMTPConnection, args: string[], callback: () => void): void {
    if (args.length) {
      this.send(501, 'Error: syntax: AUTH CRAM-MD5')
      return callback()
    }

    const challenge = `<${String(Math.random())
      .replace(/^[0.]+/, '')
      .substr(0, 8)}${Math.floor(Date.now() / 1000)}@${this.name}>`

    this._nextHandler = (command: Buffer, cb?: () => void) => {
      SASL['CRAM-MD5_token'].call(this, true, challenge, command.toString(), cb || (() => {}))
    }
    this.send(334, Buffer.from(challenge).toString('base64'))
    return callback()
  },

  PLAIN_token(this: SMTPConnection, canAbort: boolean, token: string, callback: () => void): void {
    token = (token || '').toString().trim()

    if (canAbort && token === '*') {
      this.send(501, 'Authentication aborted')
      return callback()
    }

    const data = Buffer.from(token, 'base64').toString().split('\x00')

    if (data.length !== 3) {
      this.send(500, 'Error: invalid userdata')
      return callback()
    }

    const username = data[1] || data[0] || ''
    const password = data[2] || ''

    this._server.onAuth(
      {
        method: 'PLAIN',
        username,
        password,
      },
      this.session,
      (err, response) => {
        if (err) {
          this._server.logger.info(
            {
              err,
              tnx: 'autherror',
              cid: this.id,
              method: 'PLAIN',
              user: username,
            },
            'Authentication error for %s using %s. %s',
            username,
            'PLAIN',
            err.message,
          )
          this.send(err.responseCode || 535, err.message)
          return callback()
        }

        if (!response?.user) {
          this._server.logger.info(
            {
              tnx: 'authfail',
              cid: this.id,
              method: 'PLAIN',
              user: username,
            },
            'Authentication failed for %s using %s',
            username,
            'PLAIN',
          )
          this.send(response?.responseCode || 535, response?.message || 'Error: Authentication credentials invalid')
          return callback()
        }

        this._server.logger.info(
          {
            tnx: 'auth',
            cid: this.id,
            method: 'PLAIN',
            user: username,
          },
          '%s authenticated using %s',
          username,
          'PLAIN',
        )
        this.session.user = response.user
        this.session.transmissionType = this._transmissionType()

        this.send(235, 'Authentication successful')
        callback()
      },
    )
  },

  LOGIN_username(this: SMTPConnection, canAbort: boolean, username: string, callback: () => void): void {
    username = (username || '').toString().trim()

    if (canAbort && username === '*') {
      this.send(501, 'Authentication aborted')
      return callback()
    }

    username = Buffer.from(username, 'base64').toString()

    if (!username) {
      this.send(500, 'Error: missing username')
      return callback()
    }

    this._nextHandler = (command: Buffer, cb?: () => void) => {
      SASL.LOGIN_password.call(this, username, command.toString(), cb || (() => {}))
    }
    this.send(334, 'UGFzc3dvcmQ6')
    return callback()
  },

  LOGIN_password(this: SMTPConnection, username: string, password: string, callback: () => void): void {
    password = (password || '').toString().trim()

    if (password === '*') {
      this.send(501, 'Authentication aborted')
      return callback()
    }

    password = Buffer.from(password, 'base64').toString()

    this._server.onAuth(
      {
        method: 'LOGIN',
        username,
        password,
      },
      this.session,
      (err, response) => {
        if (err) {
          this._server.logger.info(
            {
              err,
              tnx: 'autherror',
              cid: this.id,
              method: 'LOGIN',
              user: username,
            },
            'Authentication error for %s using %s. %s',
            username,
            'LOGIN',
            err.message,
          )
          this.send(err.responseCode || 535, err.message)
          return callback()
        }

        if (!response?.user) {
          this._server.logger.info(
            {
              tnx: 'authfail',
              cid: this.id,
              method: 'LOGIN',
              user: username,
            },
            'Authentication failed for %s using %s',
            username,
            'LOGIN',
          )
          this.send(response?.responseCode || 535, response?.message || 'Error: Authentication credentials invalid')
          return callback()
        }

        this._server.logger.info(
          {
            tnx: 'auth',
            cid: this.id,
            method: 'LOGIN',
            user: username,
          },
          '%s authenticated using %s',
          username,
          'LOGIN',
        )
        this.session.user = response.user
        this.session.transmissionType = this._transmissionType()

        this.send(235, 'Authentication successful')
        callback()
      },
    )
  },

  XOAUTH2_token(this: SMTPConnection, canAbort: boolean, token: string, callback: () => void): void {
    token = (token || '').toString().trim()

    if (canAbort && token === '*') {
      this.send(501, 'Authentication aborted')
      return callback()
    }

    let username = ''
    let accessToken = ''

    // Parse the token using a more robust approach
    const tokenParts = Buffer.from(token, 'base64').toString().split('\x01')
    for (const part of tokenParts) {
      const [key, ...valueParts] = part.split('=')
      const value = valueParts.join('=').trim()

      if (key.toLowerCase() === 'user') {
        username = value
      }
      else if (key.toLowerCase() === 'auth') {
        const [authType, ...tokenParts] = value.split(/\s+/)
        if (authType.toLowerCase() === 'bearer') {
          accessToken = tokenParts.join(' ')
        }
      }
    }

    if (!username || !accessToken) {
      this.send(500, 'Error: invalid userdata')
      return callback()
    }

    this._server.onAuth(
      {
        method: 'XOAUTH2',
        username,
        accessToken,
      },
      this.session,
      (err, response) => {
        if (err) {
          this._server.logger.info(
            {
              err,
              tnx: 'autherror',
              cid: this.id,
              method: 'XOAUTH2',
              user: username,
            },
            'Authentication error for %s using %s. %s',
            username,
            'XOAUTH2',
            err.message,
          )
          this.send(err.responseCode || 535, err.message)
          return callback()
        }

        if (!response?.user) {
          this._server.logger.info(
            {
              tnx: 'authfail',
              cid: this.id,
              method: 'XOAUTH2',
              user: username,
            },
            'Authentication failed for %s using %s',
            username,
            'XOAUTH2',
          )
          this._nextHandler = (command: Buffer, cb?: () => void) => {
            SASL.XOAUTH2_error.call(this, command.toString(), cb || (() => {}))
          }
          this.send(response?.responseCode || 334, Buffer.from(JSON.stringify(response?.data || {})).toString('base64'))
          return callback()
        }

        this._server.logger.info(
          {
            tnx: 'auth',
            cid: this.id,
            method: 'XOAUTH2',
            user: username,
          },
          '%s authenticated using %s',
          username,
          'XOAUTH2',
        )
        this.session.user = response.user
        this.session.transmissionType = this._transmissionType()

        this.send(235, 'Authentication successful')
        callback()
      },
    )
  },

  XOAUTH2_error(this: SMTPConnection, _data: string, callback: () => void): void {
    this.send(535, 'Error: Username and Password not accepted')
    return callback()
  },

  'CRAM-MD5_token': function (this: SMTPConnection, canAbort: boolean, challenge: string, token: string, callback: () => void): void {
    token = (token || '').toString().trim()

    if (canAbort && token === '*') {
      this.send(501, 'Authentication aborted')
      return callback()
    }

    const tokenParts = Buffer.from(token, 'base64').toString().split(' ')
    const username = tokenParts.shift() || ''
    const challengeResponse = (tokenParts.shift() || '').toLowerCase()

    this._server.onAuth(
      {
        method: 'CRAM-MD5',
        username,
        challenge,
        challengeResponse,
        validatePassword(password: string): boolean {
          const hmac = createHmac('md5', password)
          return hmac.update(challenge).digest('hex').toLowerCase() === challengeResponse
        },
      },
      this.session,
      (err, response) => {
        if (err) {
          this._server.logger.info(
            {
              err,
              tnx: 'autherror',
              cid: this.id,
              method: 'CRAM-MD5',
              user: username,
            },
            'Authentication error for %s using %s. %s',
            username,
            'CRAM-MD5',
            err.message,
          )
          this.send(err.responseCode || 535, err.message)
          return callback()
        }

        if (!response?.user) {
          this._server.logger.info(
            {
              tnx: 'authfail',
              cid: this.id,
              method: 'CRAM-MD5',
              user: username,
            },
            'Authentication failed for %s using %s',
            username,
            'CRAM-MD5',
          )
          this.send(response?.responseCode || 535, response?.message || 'Error: Authentication credentials invalid')
          return callback()
        }

        this._server.logger.info(
          {
            tnx: 'auth',
            cid: this.id,
            method: 'CRAM-MD5',
            user: username,
          },
          '%s authenticated using %s',
          username,
          'CRAM-MD5',
        )
        this.session.user = response.user
        this.session.transmissionType = this._transmissionType()

        this.send(235, 'Authentication successful')
        callback()
      },
    )
  },

  SASL_XCLIENT(this: SMTPConnection, args: string[], callback: (error?: Error) => void): void {
    const username = ((args && args[0]) || '').toString().trim()
    this._server.onAuth(
      {
        method: 'XCLIENT',
        username,
        password: undefined,
      },
      this.session,
      (err, response) => {
        if (err) {
          this._server.logger.info(
            {
              err,
              tnx: 'autherror',
              cid: this.id,
              method: 'XCLIENT',
              user: username,
            },
            'Authentication error for %s using %s. %s',
            username,
            'XCLIENT',
            err.message,
          )
          return callback(err)
        }

        if (!response?.user) {
          this._server.logger.info(
            {
              tnx: 'authfail',
              cid: this.id,
              method: 'XCLIENT',
              user: username,
            },
            'Authentication failed for %s using %s',
            username,
            'XCLIENT',
          )
          return callback(new Error('Authentication credentials invalid'))
        }

        this._server.logger.info(
          {
            tnx: 'auth',
            cid: this.id,
            method: 'XCLIENT',
            user: username,
          },
          '%s authenticated using %s',
          username,
          'XCLIENT',
        )

        this.session.user = response.user
        this.session.transmissionType = this._transmissionType()

        callback()
      },
    )
  },
} as const

export default SASL
