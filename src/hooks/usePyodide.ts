import { useEffect, useMemo, useState } from 'react'

type Status = 'idle' | 'loading' | 'ready' | 'error'

let pyodideLoader: Promise<any> | null = null

const PYODIDE_INDEX_URL = 'https://cdn.jsdelivr.net/pyodide/v0.25.1/full/'
const PYTHON_PACKAGE_ROOT = '/python'

type PackageFile = {
  sourcePath: string
  targetPath: string
  binary?: boolean
}

const PACKAGE_FILES: PackageFile[] = [
  {
    sourcePath: 'python/witrnhid/__init__.py',
    targetPath: 'witrnhid/__init__.py',
  },
  {
    sourcePath: 'python/witrnhid/core.py',
    targetPath: 'witrnhid/core.py',
  },
  {
    sourcePath: 'python/witrnhid/web.py',
    targetPath: 'witrnhid/web.py',
  },
]

async function ensurePyodideScript(indexUrl: string) {
  if (typeof window === 'undefined') {
    return
  }
  console.log('[Pyodide] ensure script start', { indexUrl })

  const scriptId = 'pyodide-loader'
  const existing = document.getElementById(scriptId) as HTMLScriptElement | null

  if (existing) {
    console.log('[Pyodide] script tag already present')
    if (window.loadPyodide) {
      console.log('[Pyodide] loadPyodide already on window')
      return
    }

    await new Promise<void>((resolve, reject) => {
      existing.addEventListener('load', () => resolve(), { once: true })
      existing.addEventListener(
        'error',
        () => reject(new Error('Pyodide 脚本加载失败')),
        { once: true },
      )
    })
    console.log('[Pyodide] waiting existing script to finish loading')
    return
  }

  await new Promise<void>((resolve, reject) => {
    const script = document.createElement('script')
    script.id = scriptId
    script.src = `${indexUrl.replace(/\/+$/, '')}/pyodide.js`
    script.async = true
    script.addEventListener('load', () => resolve(), { once: true })
    script.addEventListener('error', () => reject(new Error('Pyodide 脚本加载失败')), {
      once: true,
    })
    document.body.appendChild(script)
  })
  console.log('[Pyodide] script appended')
}

async function mountPythonPackage(pyodide: any) {
  const fs = pyodide.FS

  try {
    fs.mkdir(PYTHON_PACKAGE_ROOT)
  } catch (error) {
    // ignore when folder already exists
  }

  for (const entry of PACKAGE_FILES) {
    const baseUrl = typeof window === 'undefined'
      ? import.meta.env.BASE_URL
      : new URL(import.meta.env.BASE_URL || '/', window.location.origin).toString()
    const assetUrl = new URL(entry.sourcePath, baseUrl).toString()
    console.log('[Pyodide] fetching package file', assetUrl)
    const response = await fetch(assetUrl)
    if (!response.ok) {
      throw new Error(`无法加载 ${entry.sourcePath}: ${response.status}`)
    }

    const targetDirSegments = entry.targetPath.split('/').slice(0, -1)
    let current = PYTHON_PACKAGE_ROOT
    for (const segment of targetDirSegments) {
      current = `${current}/${segment}`
      try {
        fs.mkdir(current)
      } catch (error) {
        // folder already exists
      }
    }

    const data = entry.binary ? new Uint8Array(await response.arrayBuffer()) : await response.text()
    const targetPath = `${PYTHON_PACKAGE_ROOT}/${entry.targetPath}`
    fs.writeFile(targetPath, data, { encoding: entry.binary ? undefined : 'utf8' })
    const dataLength = entry.binary ? (data as Uint8Array).byteLength : (data as string).length
    console.log('[Pyodide] mounted file', { targetPath, length: dataLength })
  }

  await pyodide.runPythonAsync(
    `
import sys
path = '${PYTHON_PACKAGE_ROOT}'
if path not in sys.path:
    sys.path.append(path)
    `,
  )
}

export function usePyodide(indexUrl: string = PYODIDE_INDEX_URL) {
  const [status, setStatus] = useState<Status>('idle')
  const [instance, setInstance] = useState<any>(null)
  const [error, setError] = useState<Error | null>(null)

  useEffect(() => {
    if (instance) {
      return
    }

    let cancelled = false

    async function bootstrap() {
      try {
        setError(null)
        setStatus((prev) => (prev === 'ready' ? prev : 'loading'))
        console.log('[Pyodide] bootstrap start')

        await ensurePyodideScript(indexUrl)

        if (!window.loadPyodide) {
          throw new Error('未能在窗口对象上找到 loadPyodide')
        }

        if (!pyodideLoader) {
          pyodideLoader = window.loadPyodide({ indexURL: indexUrl })
          console.log('[Pyodide] loadPyodide invoked')
        }

        const pyodide = await pyodideLoader
        console.log('[Pyodide] pyodide loaded')

        if (cancelled) {
          return
        }

        await mountPythonPackage(pyodide)
        console.log('[Pyodide] package mounted')

        await pyodide.runPythonAsync(
          `
from witrnhid.web import decode_hex_payload

def decode_hex(payload: str):
    return decode_hex_payload(payload)
          `,
        )
        console.log('[Pyodide] helper registered')

        if (cancelled) {
          return
        }

        setInstance(pyodide)
        setStatus('ready')
        console.log('[Pyodide] ready')
      } catch (err) {
        if (cancelled) {
          return
        }
        setStatus('error')
        setError(err as Error)
        console.error('[Pyodide] bootstrap error', err)
      }
    }

    bootstrap()

    return () => {
      cancelled = true
    }
  }, [indexUrl, instance])

  const metadata = useMemo(() => ({ status, error }), [status, error])

  return { pyodide: instance, ...metadata }
}
