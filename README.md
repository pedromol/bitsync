# bitsync

A simple JavaScript CLI that uses Bitwarden Secrets Manager CLI (`bws`) to copy all secrets from a SOURCE account to a TARGET account. Intended to run as a Kubernetes CronJob and exit with appropriate codes.

## Requirements

- `bw` available in PATH
- Node.js 18+

## Configuration

All configuration is provided via environment variables:

- `SOURCE_BW_CLIENTID` required. Personal API key client_id for SOURCE.
- `SOURCE_BW_CLIENTSECRET` required. Personal API key client_secret for SOURCE.
- `SOURCE_BW_PASSWORD` master password value for SOURCE (program uses this fixed env name).
- `SOURCE_BW_HOST` optional. Base URL for the SOURCE server (e.g. `https://vault.bitwarden.com`, `https://vault.bitwarden.eu`).
- `TARGET_BW_CLIENTID` required. Personal API key client_id for TARGET.
- `TARGET_BW_CLIENTSECRET` required. Personal API key client_secret for TARGET.
- `TARGET_BW_PASSWORD` master password value for TARGET (program uses this fixed env name).
- `TARGET_BW_HOST` optional. Base URL for the TARGET server.
- `TARGET_BW_ORGANIZATION_ID` optional. If set, imports into the specified organization.

## Behavior

- Logs in to SOURCE using API key and unlocks with master password; exports vault as JSON.
- Logs in to TARGET using API key and unlocks; imports JSON to TARGET (optionally to an organization).
 - Logs in to TARGET using API key and unlocks; imports using `bitwardenjson` format into TARGET (optionally to an organization).
- Uses isolated CLI app data dirs to avoid cross-account state.
- No secret values are logged.
- Exits `0` on success, `2` on missing configuration, `3` if `bw` is not available, `1` on operational errors.

## Local Usage

```bash
npm start
```

or

```bash
node src/index.js
```

## Docker

Build the image:

```bash
docker build -t bitsync:latest .
```

Run the container:

```bash
docker run --rm \
  -e SOURCE_BW_CLIENTID=... \
  -e SOURCE_BW_CLIENTSECRET=... \
  -e SOURCE_BW_PASSWORD='source-master-password-with-$pecial!' \
  -e TARGET_BW_CLIENTID=... \
  -e TARGET_BW_CLIENTSECRET=... \
  -e TARGET_BW_PASSWORD='target-master-password' \
  -e SOURCE_BW_HOST=https://vault.bitwarden.com \
  -e TARGET_BW_HOST=https://vault.bitwarden.eu \
  bitsync:latest
```

## Kubernetes

`deploy.yaml` contains a `Secret`, `ConfigMap`, and `CronJob` example. Update the image and namespace as needed. Apply:

```bash
kubectl apply -f deploy.yaml
```

## Notes

- Authentication uses personal API keys (`BW_CLIENTID`/`BW_CLIENTSECRET`) and requires master passwords to unlock.
- For custom/self-hosted servers, set the server base URL per account as described above.
- The CLI depends on `bw` commands: `config server`, `login --apikey`, `unlock --passwordenv`, `export`, and `import`.
