import type { WritableOptions } from 'node:stream'
import { Buffer } from 'node:buffer'
import { PassThrough, Writable } from 'node:stream'

export interface SMTPStreamOptions extends WritableOptions {
  maxBytes?: number
}

export interface ExtendedPassThrough extends PassThrough {
  byteLength?: number
  sizeExceeded?: boolean
}

/**
 * Incoming SMTP stream parser. Detects and emits commands. If switched to
 * data mode, emits unescaped data events until final .
 *
 * @constructor
 * @param {object} [options] Optional Stream options object
 */
export class SMTPStream extends Writable {
  private _dataMode: boolean
  private _dataStream: ExtendedPassThrough | null
  private _maxBytes: number
  public dataBytes: number
  private _continueCallback: boolean | (() => void)
  private _remainder: string
  private _lastBytes: Buffer | false
  public isClosed: boolean

  constructor(options?: SMTPStreamOptions) {
    // init Writable
    super(options)

    // Indicates if the stream is currently in data mode
    this._dataMode = false
    // Output stream for the current data mode
    this._dataStream = null
    // How many bytes are allowed for a data stream
    this._maxBytes = Infinity
    // How many bytes have been emitted to data stream
    this.dataBytes = 0
    // Callback to run once data mode is finished
    this._continueCallback = false
    // unprocessed chars from the last parsing iteration (used in command mode)
    this._remainder = ''
    // unprocessed bytes from the last parsing iteration (used in data mode)
    this._lastBytes = false

    this.isClosed = false

    // once the input stream ends, flush all output without expecting the newline
    this.on('finish', () => this._flushData())
  }

  /**
   * Command handler. Override this with your own implementation.
   * @param _command - The command buffer to process
   * @param _callback - Optional callback to execute after command processing
   */
  oncommand(_command: Buffer, _callback?: () => void): void {
    throw new Error('Command handler is not set')
  }

  /**
   * Switch to data mode and return output stream. The dots in the stream are unescaped.
   *
   * @param maxBytes - Maximum number of bytes allowed in data mode
   * @returns Data stream for handling incoming data
   */
  startDataMode(maxBytes?: number): ExtendedPassThrough {
    this._dataMode = true
    this._maxBytes = (maxBytes && Number(maxBytes)) || Infinity
    this.dataBytes = 0
    this._dataStream = new PassThrough() as ExtendedPassThrough

    return this._dataStream
  }

  /**
   * Call this once data mode is over and you have finished processing the data stream
   */
  continue(): void {
    if (typeof this._continueCallback === 'function') {
      this._continueCallback()
      this._continueCallback = false
    }
    else {
      // indicate that the 'continue' was already called once the stream actually ends
      this._continueCallback = true
    }
  }

  // PRIVATE METHODS

  /**
   * Implementation of the Writable._write method.
   */
  _write(chunk: Buffer, _encoding: string, next: (error?: Error | null) => void): void {
    if (!chunk || !chunk.length) {
      return next()
    }

    let data: string
    let pos = 0
    let newlineRegex: RegExp

    let called = false
    const done = (...args: Array<Error | null | undefined>) => {
      if (called) {
        return
      }
      called = true
      next(...args)
    }

    if (this.isClosed) {
      return done()
    }

    if (!this._dataMode) {
      newlineRegex = /\r?\n/g
      data = this._remainder + chunk.toString('binary')

      const readLine = (): void => {
        let match: RegExpExecArray | null
        let line: string
        let buf: Buffer

        // check if the mode is not changed
        if (this._dataMode) {
          buf = Buffer.from(data.substr(pos), 'binary')
          this._remainder = ''
          return this._write(buf, 'binary', done)
        }

        // search for the next newline
        // exec keeps count of the last match with lastIndex
        // so it knows from where to start with the next iteration
        const matchResult = newlineRegex.exec(data)
        if (matchResult) {
          match = matchResult
          line = data.substr(pos, match.index - pos)
          pos += line.length + match[0].length
        }
        else {
          this._remainder = pos < data.length ? data.substr(pos) : ''
          return done()
        }

        this.oncommand(Buffer.from(line, 'binary'), readLine)
      }

      // start reading lines
      readLine()
    }
    else {
      this._feedDataStream(chunk, done)
    }
  }

  /**
   * Processes a chunk in data mode. Escape dots are removed and final dot ends the data mode.
   */
  private _feedDataStream(chunk: Buffer, done: (error?: Error | null) => void): void {
    let i: number
    const endseq = Buffer.from('\r\n.\r\n')
    let len: number
    let handled: boolean
    let buf: Buffer

    if (this._lastBytes && this._lastBytes.length) {
      chunk = Buffer.concat([this._lastBytes, chunk], this._lastBytes.length + chunk.length)
      this._lastBytes = false
    }

    len = chunk.length

    // check if the data does not start with the end terminator
    if (!this.dataBytes && len >= 3 && Buffer.compare(chunk.slice(0, 3), Buffer.from('.\r\n')) === 0) {
      this._endDataMode(false, chunk.slice(3), done)
      return
    }

    // check if the first symbol is a escape dot
    if (!this.dataBytes && len >= 2 && chunk[0] === 0x2E && chunk[1] === 0x2E) {
      chunk = chunk.slice(1)
      len--
    }

    // seek for the stream ending
    for (i = 2; i < len - 2; i++) {
      // if the dot is the first char in a line
      if (chunk[i] === 0x2E && chunk[i - 1] === 0x0A) {
        // if the dot matches end terminator
        if (Buffer.compare(chunk.slice(i - 2, i + 3), endseq) === 0) {
          if (i > 2) {
            buf = chunk.slice(0, i)
            this.dataBytes += buf.length
            this._endDataMode(buf, chunk.slice(i + 3), done)
          }
          else {
            this._endDataMode(false, chunk.slice(i + 3), done)
          }

          return
        }

        // check if the dot is an escape char and remove it
        if (chunk[i + 1] === 0x2E) {
          buf = chunk.slice(0, i)

          this._lastBytes = false // clear remainder bytes
          this.dataBytes += buf.length // increment byte counter

          // emit what we already have and continue without the dot
          if (this._dataStream?.writable) {
            this._dataStream.write(buf)
          }

          void setImmediate(() => this._feedDataStream(chunk.slice(i + 1), done))
          return
        }
      }
    }

    // keep the last bytes
    if (chunk.length < 4) {
      this._lastBytes = chunk
    }
    else {
      this._lastBytes = chunk.slice(chunk.length - 4)
    }

    // if current chunk is longer than the remainder bytes we keep for later emit the available bytes
    if (this._lastBytes.length < chunk.length) {
      buf = chunk.slice(0, chunk.length - this._lastBytes.length)
      this.dataBytes += buf.length

      // write to stream but stop if need to wait for drain
      if (this._dataStream?.writable) {
        handled = this._dataStream.write(buf)
        if (!handled) {
          this._dataStream.once('drain', done)
        }
        else {
          return done()
        }
      }
      else {
        return done()
      }
    }
    else {
      // nothing to emit, continue with the input stream
      return done()
    }
  }

  /**
   * Flushes remaining bytes
   */
  private _flushData(): void {
    if (this._remainder && !this.isClosed) {
      const line = this._remainder
      this._remainder = ''
      this.oncommand(Buffer.from(line, 'binary'))
    }
  }

  /**
   * Ends data mode and returns to command mode. Stream is not resumed before #continue is called
   */
  private _endDataMode(chunk: Buffer | false, remainder: Buffer, callback: (error?: Error | null) => void): void {
    if (this._continueCallback === true) {
      this._continueCallback = false
      // wait until the stream is actually over and then continue
      this._dataStream?.once('end', callback)
    }
    else {
      this._continueCallback = () => this._write(remainder, 'binary', callback)
    }

    if (this._dataStream) {
      this._dataStream.byteLength = this.dataBytes
      this._dataStream.sizeExceeded = this.dataBytes > this._maxBytes

      if (chunk && chunk.length && this._dataStream.writable) {
        this._dataStream.end(chunk)
      }
      else {
        this._dataStream.end()
      }
    }

    this._dataMode = false
    this._remainder = ''
    this._dataStream = null
  }
}

export default SMTPStream
