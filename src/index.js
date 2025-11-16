#!/usr/bin/env node
const { execFile } = require('child_process')
const fs = require('fs')
const path = require('path')

function run(cmd, args, env, opts = {}) {
  return new Promise((resolve, reject) => {
    const child = execFile(cmd, args, { env: { ...process.env, ...env }, timeout: opts.timeout || 0 }, (error, stdout, stderr) => {
      if (error) {
        reject({ error, stdout, stderr })
        return
      }
      resolve({ stdout, stderr })
    })
  })
}

async function ensureBwAvailable() {
  try {
    const { stdout } = await run('bw', ['--version'], {})
    process.stdout.write(`bw version: ${stdout.trim()}\n`)
  } catch (e) {
    process.stderr.write('bw not found or not executable\n')
    process.exit(3)
  }
}

async function bwConfigServer(env, host) {
  if (!host) return
  await run('bw', ['config', 'server', host], env)
}

function ensureCleanAppDir(dir) {
  try {
    fs.rmSync(dir, { recursive: true, force: true })
  } catch (_) {}
  fs.mkdirSync(dir, { recursive: true })
}

function log(msg) {
  process.stdout.write(msg + '\n')
}

function logSource(msg) {
  log(`[SOURCE] ${msg}`)
}

function logTarget(msg) {
  log(`[TARGET] ${msg}`)
}

async function bwLoginUnlock(label, appDir, host, clientId, clientSecret) {
  if (!clientId || !clientSecret) {
    process.stderr.write(`[${label.toUpperCase()}] Missing API key or master password envs\n`)
    process.exit(2)
  }
  ensureCleanAppDir(appDir)
  const env = { ...process.env, BITWARDENCLI_APPDATA_DIR: appDir, BW_CLIENTID: clientId, BW_CLIENTSECRET: clientSecret }
  if (host) await bwConfigServer(env, host)
  const passwordEnvName = label === 'source' ? 'SOURCE_BW_PASSWORD' : 'TARGET_BW_PASSWORD'
  if (!env[passwordEnvName] && !process.env[passwordEnvName]) {
    process.stderr.write(`[${label.toUpperCase()}] Password env ${passwordEnvName} is not set\n`)
    process.exit(2)
  }
  try {
    log(`[${label.toUpperCase()}] Logging in with API key`)
    await run('bw', ['login', '--apikey', '--raw'], env, { timeout: 20000 })
    try {
      const { stdout } = await run('bw', ['status', '--raw'], env, { timeout: 10000 })
      log(`[${label.toUpperCase()}] Status after login: ${stdout.trim()}`)
    } catch (_) {}
  } catch (e) {
    process.stderr.write(`[${label.toUpperCase()}] Failed to login with API key\n`)
    if (e.stderr) process.stderr.write(e.stderr + '\n')
    process.exit(1)
  }
  let session
  try {
    log(`[${label.toUpperCase()}] Unlocking vault`)
    const { stdout } = await run('bw', ['unlock', '--passwordenv', passwordEnvName, '--raw'], env, { timeout: 30000 })
    session = stdout.trim()
  } catch (e) {
    process.stderr.write(`[${label.toUpperCase()}] Failed to unlock vault\n`)
    if (e.stderr) process.stderr.write(e.stderr + '\n')
    process.exit(1)
  }
  try {
    const { stdout } = await run('bw', ['status', '--raw'], env, { timeout: 10000 })
    log(`[${label.toUpperCase()}] Status: ${stdout.trim()}`)
  } catch (_) {}
  return { ...env, BW_SESSION: session }
}

async function bwExport(env, outPath, organizationId) {
  const args = ['export', '--output', outPath, '--format', 'json']
  if (organizationId) args.push('--organizationid', organizationId)
  await run('bw', args, env, { timeout: 120000 })
}

async function bwImport(env, inPath, format, organizationId) {
  const args = ['import', format || 'bitwardenjson', inPath]
  if (organizationId) args.push('--organizationid', organizationId)
  await run('bw', args, env, { timeout: 30000 })
}

async function bwImportAuto(env, inPath, organizationId) {
  const KNOWN = [
    'bitwardenjson','json','encrypted_json','bitwardencsv','csv',
    '1password1pif','1password1pux','1passwordmaccsv','1passwordwincsv','ascendocsv','avastcsv','avastjson','aviracsv','blackberrycsv','blurcsv','bravecsv','buttercupcsv','chromecsv','clipperzhtml','codebookcsv','dashlanecsv','dashlanejson','edgecsv','encryptrcsv','enpasscsv','enpassjson','firefoxcsv','fsecurefsk','gnomejson','kasperskytxt','keepass2xml','keepassxcsv','keepercsv','lastpasscsv','logmeoncecsv','meldiumcsv','msecurecsv','mykicsv','netwrixpasswordsecure','nordpasscsv','operacsv','padlockcsv','passboltcsv','passkeepcsv','passkyjson','passmanjson','passpackcsv','passwordagentcsv','passwordbossjson','passworddepot17xml','passworddragonxml','passwordwallettxt','passwordxpcsv','protonpass','psonojson','pwsafexml','remembearcsv','roboformcsv','safaricsv','safeincloudxml','saferpasscsv','securesafecsv','splashidcsv','stickypasswordxml','truekeycsv','upmcsv','vivaldicsv','yoticsv','zohovaultcsv'
  ]
  let formats = ['bitwardenjson','json','encrypted_json','bitwardencsv']
  try {
    const { stdout } = await run('bw', ['import', '--formats'], env, { timeout: 10000 })
    const lines = stdout.split(/\r?\n/).map(l => l.trim().toLowerCase()).filter(Boolean)
    const discovered = lines.filter(l => KNOWN.includes(l))
    if (discovered.length) {
      const priority = ['bitwardenjson','json','1password1pif']
      const ordered = [
        ...priority.filter(p => discovered.includes(p)),
        ...discovered.filter(f => !priority.includes(f))
      ]
      formats = ordered
    }
    logTarget(`Supported import formats: ${formats.join(', ')}`)
  } catch (_) {}
  for (const f of formats) {
    try {
      await bwImport(env, inPath, f, organizationId)
      return f
    } catch (e) {
      continue
    }
  }
  throw new Error('No supported importer type')
}

const { spawn } = require('child_process')
function runWithInput(cmd, args, env, input, opts = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { env: { ...process.env, ...env } })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', d => { stdout += d.toString() })
    child.stderr.on('data', d => { stderr += d.toString() })
    child.on('error', error => reject({ error, stdout, stderr }))
    child.on('close', code => {
      if (code !== 0) reject({ error: new Error(`exit ${code}`), stdout, stderr })
      else resolve({ stdout, stderr })
    })
    if (input) child.stdin.write(input)
    child.stdin.end()
  })
}

function sanitizeItemForCreate(item, targetOrgId) {
  return {
    organizationId: targetOrgId || null,
    collectionIds: targetOrgId ? [] : null,
    folderId: null,
    type: item.type,
    name: item.name,
    notes: item.notes || null,
    favorite: !!item.favorite,
    fields: item.fields || [],
    login: item.login || null,
    secureNote: item.secureNote || null,
    card: item.card || null,
    identity: item.identity || null,
    reprompt: item.reprompt || 0,
  }
}

function sanitizeExportFile(inPath) {
  const raw = fs.readFileSync(inPath, 'utf8')
  const data = JSON.parse(raw)
  if (!Array.isArray(data.items)) return inPath
  const base32re = /^[A-Z2-7]+=*$/i
  for (const it of data.items) {
    if (it.login && typeof it.login.totp === 'string') {
      const t = it.login.totp.trim()
      if (!(base32re.test(t) || t.startsWith('otpauth://'))) {
        delete it.login.totp
      }
    }
    if (it.collectionIds == null) it.collectionIds = []
  }
  const outPath = inPath.replace(/\.json$/, '.sanitized.json')
  fs.writeFileSync(outPath, JSON.stringify(data))
  return outPath
}

async function copyItems(sourceEnv, targetEnv, targetOrgId) {
  const listArgs = ['list', 'items']
  const { stdout: listOut } = await run('bw', listArgs, sourceEnv)
  const items = JSON.parse(listOut)
  for (const it of items) {
    const { stdout: fullOut } = await run('bw', ['get', 'item', it.id], sourceEnv)
    const full = JSON.parse(fullOut)
    const payload = sanitizeItemForCreate(full, targetOrgId)
    const encoded = await runWithInput('bw', ['encode'], targetEnv, JSON.stringify(payload))
    await runWithInput('bw', ['create', 'item'], targetEnv, encoded.stdout)
  }
}

async function bwLogout(env, label) {
  try {
    await run('bw', ['logout'], env, { timeout: 10000 })
    log(`[${label.toUpperCase()}] Logged out`)
  } catch (_) {}
}

function required(name) {
  const v = process.env[name]
  if (!v) {
    process.stderr.write(`Missing required env: ${name}\n`)
    process.exit(2)
  }
  return v
}

function optional(name) {
  return process.env[name]
}

async function main() {
  await ensureBwAvailable()

  const sourceClientId = required('SOURCE_BW_CLIENTID')
  const sourceClientSecret = required('SOURCE_BW_CLIENTSECRET')
  const targetClientId = required('TARGET_BW_CLIENTID')
  const targetClientSecret = required('TARGET_BW_CLIENTSECRET')
  const sourceHost = optional('SOURCE_BW_HOST')
  const targetHost = optional('TARGET_BW_HOST')
  const targetOrgId = optional('TARGET_BW_ORGANIZATION_ID')

  const baseDir = '/tmp/bitsync'
  const sourceDir = path.join(baseDir, 'source')
  const targetDir = path.join(baseDir, 'target')
  fs.mkdirSync(sourceDir, { recursive: true })
  fs.mkdirSync(targetDir, { recursive: true })

  logSource(`Server: ${sourceHost || 'default'}`)
  logTarget(`Server: ${targetHost || 'default'}`)
  const [sourceEnv, targetEnv] = await Promise.all([
    bwLoginUnlock('source', sourceDir, sourceHost, sourceClientId, sourceClientSecret),
    bwLoginUnlock('target', targetDir, targetHost, targetClientId, targetClientSecret),
  ])
  const exportPath = path.join(baseDir, 'export.json')
  try {
    logSource(`Exporting vault to ${exportPath}`)
    await bwExport(sourceEnv, exportPath)
    logSource('Export completed')
  } catch (e) {
    process.stderr.write('[SOURCE] Failed to export source vault\n')
    if (e.stderr) process.stderr.write(e.stderr + '\n')
    process.exit(1)
  }

  try {
    logTarget(`Importing vault from ${exportPath}${targetOrgId ? ` into org ${targetOrgId}` : ''}`)
    const sanitized = sanitizeExportFile(exportPath)
    const usedFormat = await bwImportAuto(targetEnv, sanitized, targetOrgId)
    logTarget(`Import completed using format ${usedFormat}`)
  } catch (e) {
    process.stderr.write('[TARGET] Failed to import into target vault\n')
    if (e.stderr) process.stderr.write(e.stderr + '\n')
    process.exit(1)
  }

  await bwLogout(sourceEnv, 'source')
  await bwLogout(targetEnv, 'target')

  process.stdout.write('Sync completed\n')
  process.exit(0)
}

main()
