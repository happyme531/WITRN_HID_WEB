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

  const scriptId = 'pyodide-loader'
  const existing = document.getElementById(scriptId) as HTMLScriptElement | null

  if (existing) {
    if (window.loadPyodide) {
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
}

async function mountPythonPackage(pyodide: any) {
  const fs = pyodide.FS

  try {
    fs.mkdir(PYTHON_PACKAGE_ROOT)
  } catch (error) {
    // ignore when folder already exists
  }

  for (const entry of PACKAGE_FILES) {
    const response = await fetch(`/${entry.sourcePath}`)
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

        await ensurePyodideScript(indexUrl)

        if (!window.loadPyodide) {
          throw new Error('未能在窗口对象上找到 loadPyodide')
        }

        if (!pyodideLoader) {
          pyodideLoader = window.loadPyodide({ indexURL: indexUrl })
        }

        const pyodide = await pyodideLoader

        if (cancelled) {
          return
        }

        await mountPythonPackage(pyodide)

        await pyodide.runPythonAsync(
          `
from witrnhid.web import decode_hex_payload

def decode_hex(payload: str):
    return decode_hex_payload(payload)
          `,
        )

        if (cancelled) {
          return
        }

        setInstance(pyodide)
        setStatus('ready')
      } catch (err) {
        if (cancelled) {
          return
        }
        setStatus('error')
        setError(err as Error)
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
