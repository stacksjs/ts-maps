<p align="center"><img src="https://github.com/stacksjs/mail-server/blob/main/.github/art/cover.jpg?raw=true" alt="Social Card of this repo"></p>

[![npm version][npm-version-src]][npm-version-href]
[![GitHub Actions][github-actions-src]][github-actions-href]
[![Commitizen friendly](https://img.shields.io/badge/commitizen-friendly-brightgreen.svg)](http://commitizen.github.io/cz-cli/)
<!-- [![npm downloads][npm-downloads-src]][npm-downloads-href] -->
<!-- [![Codecov][codecov-src]][codecov-href] -->

# The Post

> Finally a mail server that can be managed.

Perfect for local development and testing environments. _Production-ready release coming soon!_

> [!NOTE]
> While this mail server works in a zero-setup & zero-config way, you still have to maintain the infrastructure that the server is deployed & running on. To automate it, including pretty server metrics visualizations & alerting, you may want to check out [Stacks](https://github.com/stacksjs/stacks), as it ships a full-featured mail server with a management interface/dashboard.

## Features

- 📨 **Mail Server** _lightweight & configurable
- 🛠️ **Mail Utilities** _send, receive, and manage emails_
- 📦 **Mail UI** _web interfaces for managing emails, including a component library_
- 🤖 **CLI** _command-line interface for managing emails_
- 🔒 **Security** _TLS support, authentication, and spam protection_
- 🚀 **Performance** _optimized for high-throughput environments_
- 🎯 **Modern** _built with TypeScript, zero dependencies_
- 📝 **Logging** _detailed logging and monitoring capabilities_

## Install

```bash
bun install -d @stacksjs/post
```

<!-- _Alternatively, you can install:_

```bash
brew install post # wip
pkgx install post # wip
``` -->

## Get Started

There are two ways of using the mail server: _as a library or as a CLI._

### Library Usage

```ts
import { SMTPServer } from '@stacksjs/post'

// Basic SMTP Server
const server = new SMTPServer({
  secure: true,
  name: 'mail.example.com',
  banner: 'Welcome to My Mail Server',
})

server.listen(25)

// Advanced Configuration
const secureServer = new SMTPServer({
  // TLS Configuration
  secure: true,
  needsUpgrade: false,
  sniOptions: new Map([
    ['example.com', {
      key: fs.readFileSync('certs/example.com.key'),
      cert: fs.readFileSync('certs/example.com.cert')
    }]
  ]),

  // Authentication
  authMethods: ['PLAIN', 'LOGIN'],
  onAuth: (auth, session, callback) => {
    if (auth.username === 'user' && auth.password === 'pass')
      callback(null, { user: 'user' })
    else
      callback(new Error('Invalid credentials'))
  },

  // Message Handling
  size: 1024 * 1024, // 1MB limit
  onData: (stream, session, callback) => {
    stream.pipe(process.stdout) // Echo message to console
    stream.on('end', callback)
  },

  // Logging
  logger: {
    info: console.log,
    debug: console.debug,
    error: console.error
  }
})

secureServer.listen(465) // SMTPS port
```

### Event Handling

```ts
server.on('connect', (session) => {
  console.log('New connection from', session.remoteAddress)
})

server.on('error', (err) => {
  console.error('Server error:', err)
})

server.on('close', () => {
  console.log('Server shutting down')
})
```

### CLI Usage

The Post CLI provides a comprehensive set of commands for managing your mail server:

```bash
# Start the server
post start                   # Start with default config
post start --config custom   # Use custom config file
post start --port 25         # Specify port
post start --secure          # Start in TLS mode

# Configuration
post init                   # Create default config file
post config show            # Display current configuration
post config set key=value   # Update configuration

# Monitoring
post status                 # Show server status
post logs                   # View server logs
post logs --live            # Live log streaming
post stats                  # Show server statistics

# User Management
post users list            # List all users
post users add <email>     # Add new user
post users remove <email>  # Remove user
post users quota <email>   # Show/set user quota

# Queue Management
post queue list            # List queued messages
post queue flush           # Process all queued messages
post queue remove <id>     # Remove message from queue

# Security
post tls setup            # Configure TLS certificates
post tls renew            # Renew certificates
post blacklist add <ip>   # Add IP to blacklist
post whitelist add <ip>   # Add IP to whitelist

# Maintenance
post backup              # Create server backup
post restore <file>      # Restore from backup
post cleanup             # Clean old logs/messages

# Advanced
post test             # Run server tests
post benchmark        # Run performance tests
post debug            # Start in debug mode
```

## Configuration

The Mail Server can be configured using a `post.config.ts` _(or `post.config.js`)_ file:

```ts
// post.config.ts
export default {
  // Server Configuration
  server: {
    name: 'mail.example.com',
    secure: true,
    ports: {
      smtp: 25,
      smtps: 465,
      submission: 587
    }
  },

  // TLS Configuration
  tls: {
    cert: '/path/to/cert.pem',
    key: '/path/to/key.pem',
    domains: ['example.com', 'mail.example.com']
  },

  // Authentication
  auth: {
    methods: ['PLAIN', 'LOGIN'],
    database: 'sqlite://users.db'
  },

  // Storage
  storage: {
    type: 'disk',
    path: '/var/mail',
    quota: '1GB'
  },

  // Security
  security: {
    rateLimit: {
      window: '1h',
      max: 1000
    },
    spamProtection: true,
    dnsbl: ['zen.spamhaus.org']
  },

  // Logging
  logging: {
    level: 'info',
    file: '/var/log/post.log',
    format: 'json'
  }
}
```

_Then run:_

```bash
post start
```

To learn more, head over to the [documentation](https://the-post.sh/).

## Testing

```bash
bun test
```

## Changelog

Please see our [releases](https://github.com/stacksjs/stacks/releases) page for more information on what has changed recently.

## Contributing

Please review the [Contributing Guide](https://github.com/stacksjs/contributing) for details.

## Community

For help, discussion about best practices, or any other conversation that would benefit from being searchable:

[Discussions on GitHub](https://github.com/stacksjs/stacks/discussions)

For casual chit-chat with others using this package:

[Join the Stacks Discord Server](https://discord.gg/stacksjs)

## Postcardware

Two things are true: Stacks OSS will always stay open-source, and we do love to receive postcards from wherever Stacks is used! _We also publish them on our website. And thank you, Spatie_

Our address: Stacks.js, 12665 Village Ln #2306, Playa Vista, CA 90094 🌎

## Sponsors

We would like to extend our thanks to the following sponsors for funding Stacks development. If you are interested in becoming a sponsor, please reach out to us.

- [JetBrains](https://www.jetbrains.com/)
- [The Solana Foundation](https://solana.com/)

## Credits

- [Andris Reinman](https://github.com/andris9) _(Author of `nodemailer` & `smtp-server`)_
- [Ralph Slooten](https://avatars.githubusercontent.com/u/1463435?s=64&v=4) _(Author of `mailtrap`)_
- [Chris Breuer](https://github.com/chrisbbreuer)
- [All Contributors](../../contributors)

## License

The MIT License (MIT). Please see [LICENSE](https://github.com/stacksjs/stacks/tree/main/LICENSE.md) for more information.

Made with 💙

<!-- Badges -->
[npm-version-src]: https://img.shields.io/npm/v/@stacksjs/mail-server?style=flat-square
[npm-version-href]: https://npmjs.com/package/@stacksjs/mail-server
[github-actions-src]: https://img.shields.io/github/actions/workflow/status/stacksjs/mail-server/ci.yml?style=flat-square&branch=main
[github-actions-href]: https://github.com/stacksjs/mail-server/actions?query=workflow%3Aci

<!-- [codecov-src]: https://img.shields.io/codecov/c/gh/stacksjs/mail-server/main?style=flat-square
[codecov-href]: https://codecov.io/gh/stacksjs/mail-server -->
