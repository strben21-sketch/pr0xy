
# Nova Proxy

A lightweight browser-style web proxy built with Node.js 22 and vanilla
HTML, CSS, and JavaScript.

Nova Proxy includes a dark browser interface, tab management, navigation
controls, bookmarks, and a server-side page-fetching endpoint.

## Features

- Dark browser-style interface
- Multiple tabs
- Back, forward, reload, and home controls
- Address bar and search
- Session-only bookmarks
- HTTP/HTTPS page fetching
- Redirect validation and private-network target restrictions
- GitHub Codespaces configuration
- No third-party runtime dependencies

## Requirements

- Node.js 22 or later
- Git
- GitHub account for Codespaces

## Quick start with GitHub Codespaces

1. Create a new GitHub repository named `nova-proxy`.
2. Add the files and folders shown in this README's project structure.
3. Commit and push the files to GitHub.
4. Open the repository on GitHub.
5. Select **Code → Codespaces → Create codespace on main**.
6. Wait for the development container to initialize.
7. If the app does not start automatically, open the Codespaces terminal
   and run:

   ```bash
   npm start
   ```

8. Open the **Ports** panel.
9. Open port `8080` in your browser.

## Run locally

Clone your repository:

```bash
git clone https://github.com/YOUR_USERNAME/nova-proxy.git
cd nova-proxy
npm install
npm start
```

Visit:

http://localhost:8080

No API keys or database are required.

## Development mode

Run with automatic server restarts:

```bash
npm run dev
```

## Health check

Open:

http://localhost:8080/health

Expected response:

```json
{"ok":true,"name":"Nova Proxy"}
```

## Environment variables

| Variable | Default | Description |
| --- | --- | --- |
| `HOST` | `0.0.0.0` | Interface to listen on |
| `UI_PORT` | `8080` | Server port |
| `PORT` | `8080` | Fallback server port |

For example:

```bash
UI_PORT=9000 npm start
```

## Project structure

```text
nova-proxy/
├── .devcontainer/
│   └── devcontainer.json
├── public/
│   ├── index.html
│   ├── style.css
│   └── app.js
├── .gitignore
├── package.json
├── server.js
└── README.md
```

## How it works

1. The browser interface runs on port 8080.
2. The address bar sends destinations to `/view?url=...`.
3. The Node.js server validates the destination and fetches the page.
4. HTML pages are returned inside an isolated iframe.
5. The interface tracks tabs and navigation history in memory.

## Compatibility limitations

Nova Proxy is a learning project, not a complete browser engine.

- It supports fetching HTML and plain-text pages.
- Some websites require JavaScript APIs or cookies that this proxy does
  not implement.
- Relative resources can load directly from their original website.
- Page links and form submissions are not comprehensively rewritten to
  remain inside the proxy.
- WebSockets, arbitrary binary downloads, and streaming media are not
  implemented.
- Some sites refuse to load in an iframe.
- Browser tabs and bookmarks reset when the page is refreshed.
- Search requests use Google when the address bar detects a search query.

## Security notes

This project includes basic checks for private and loopback IP addresses,
DNS results, and redirect destinations. Those checks alone do not provide
complete protection against DNS rebinding, unusual IP representations,
network routing changes, or all server-side request forgery (SSRF) attacks.

Do not deploy this development proxy as a public, unrestricted service.
For public deployment, add robust outbound network controls, request
rate limits, authentication, abuse monitoring, strict response limits,
and a tested SSRF protection layer.

Do not enter passwords or sensitive information into proxied websites.
This implementation is not designed for secure account sessions.

## License

Choose and add a license before distributing your own version. If you
reuse code from another project, follow that project's license terms.
