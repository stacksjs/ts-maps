# Install

Installing `mail-server` is easy. Simply pull it in via your package manager of choice, or download the binary directly.

## Package Managers

Choose your package manager of choice:

::: code-group

```sh [npm]
npm install --save-dev @stacksjs/mail-server
# npm i -d @stacksjs/mail-server

# or, install globally via
npm i -g @stacksjs/mail-server
```

```sh [bun]
bun install --dev @stacksjs/mail-server
# bun add --dev @stacksjs/mail-server
# bun i -d @stacksjs/mail-server

# or, install globally via
bun add --global @stacksjs/mail-server
```

```sh [pnpm]
pnpm add --save-dev @stacksjs/mail-server
# pnpm i -d @stacksjs/mail-server

# or, install globally via
pnpm add --global @stacksjs/mail-server
```

```sh [yarn]
yarn add --dev @stacksjs/mail-server
# yarn i -d @stacksjs/mail-server

# or, install globally via
yarn global add @stacksjs/mail-server
```

```sh [brew]
brew install mail-server # coming soon
```

```sh [pkgx]
pkgx mail-server # coming soon
```

:::

Read more about how to use it in the Usage section of the documentation.

## Binaries

Choose the binary that matches your platform and architecture:

::: code-group

```sh [macOS (arm64)]
# Download the binary
curl -L https://github.com/stacksjs/mail-server/releases/download/v0.9.1/mail-server-darwin-arm64 -o mail-server

# Make it executable
chmod +x mail-server

# Move it to your PATH
mv mail-server /usr/local/bin/mail-server
```

```sh [macOS (x64)]
# Download the binary
curl -L https://github.com/stacksjs/mail-server/releases/download/v0.9.1/mail-server-darwin-x64 -o mail-server

# Make it executable
chmod +x mail-server

# Move it to your PATH
mv mail-server /usr/local/bin/mail-server
```

```sh [Linux (arm64)]
# Download the binary
curl -L https://github.com/stacksjs/mail-server/releases/download/v0.9.1/mail-server-linux-arm64 -o mail-server

# Make it executable
chmod +x mail-server

# Move it to your PATH
mv mail-server /usr/local/bin/mail-server
```

```sh [Linux (x64)]
# Download the binary
curl -L https://github.com/stacksjs/mail-server/releases/download/v0.9.1/mail-server-linux-x64 -o mail-server

# Make it executable
chmod +x mail-server

# Move it to your PATH
mv mail-server /usr/local/bin/mail-server
```

```sh [Windows (x64)]
# Download the binary
curl -L https://github.com/stacksjs/mail-server/releases/download/v0.9.1/mail-server-windows-x64.exe -o mail-server.exe

# Move it to your PATH (adjust the path as needed)
move mail-server.exe C:\Windows\System32\mail-server.exe
```

::: tip
You can also find the `mail-server` binaries in GitHub [releases](https://github.com/stacksjs/mail-server/releases).
:::
