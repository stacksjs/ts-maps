# Configuration

The Reverse Proxy can be configured using a `mail-server.config.ts` _(or `mail-server.config.js`)_ file and it will be automatically loaded when running the `reverse-proxy` command.

```ts
// mail-server.config.{ts,js}
import type { ReverseProxyOptions } from '@stacksjs/mail-server'
import os from 'node:os'
import path from 'node:path'

const config: ReverseProxyOptions = {
  /**
   * The from URL to proxy from.
   * Default: localhost:5173
   */
  from: 'localhost:5173',

  /**
   * The to URL to proxy to.
   * Default: stacks.localhost
   */
  to: 'stacks.localhost',

  /**
   * The HTTPS settings.
   * Default: true
   * If set to false, the proxy will use HTTP.
   * If set to true, the proxy will use HTTPS.
   * If set to an object, the proxy will use HTTPS with the provided settings.
   */
  https: {
    domain: 'stacks.localhost',
    hostCertCN: 'stacks.localhost',
    caCertPath: path.join(os.homedir(), '.stacks', 'ssl', `stacks.localhost.ca.crt`),
    certPath: path.join(os.homedir(), '.stacks', 'ssl', `stacks.localhost.crt`),
    keyPath: path.join(os.homedir(), '.stacks', 'ssl', `stacks.localhost.crt.key`),
    altNameIPs: ['127.0.0.1'],
    altNameURIs: ['localhost'],
    organizationName: 'stacksjs.org',
    countryName: 'US',
    stateName: 'California',
    localityName: 'Playa Vista',
    commonName: 'stacks.localhost',
    validityDays: 180,
    verbose: false,
  },

  /**
   * The verbose setting.
   * Default: false
   * If set to true, the proxy will log more information.
   */
  verbose: false,
}

export default config
```

_Then run:_

```bash
./mail-server start
```

Within the next section of the documentation, the Showcase section, you will find a list of examples of how to use the Reverse Proxy in different scenarios.
