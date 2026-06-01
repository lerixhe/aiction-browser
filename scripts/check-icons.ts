import { ACTION_ICON_LIBRARY } from '../src/shared/ui/icon-library.ts'

const API_BASE = 'https://api.iconify.design'

interface IconCheckResult {
  icon: string
  label: string
  valid: boolean
  error?: string
}

async function checkIcon(iconName: string): Promise<boolean> {
  try {
    // Iconify API: GET /{prefix}/{name}.svg returns 200 if icon exists
    const response = await fetch(`${API_BASE}/${iconName}.svg`, { method: 'HEAD' })
    return response.ok
  } catch {
    return false
  }
}

async function main() {
  console.log(`Checking ${ACTION_ICON_LIBRARY.length} icons...\n`)
  
  const results: IconCheckResult[] = []
  const batchSize = 10
  
  for (let i = 0; i < ACTION_ICON_LIBRARY.length; i += batchSize) {
    const batch = ACTION_ICON_LIBRARY.slice(i, i + batchSize)
    const batchResults = await Promise.all(
      batch.map(async ({ icon, label }) => {
        const valid = await checkIcon(icon)
        return { icon, label, valid }
      })
    )
    results.push(...batchResults)
    process.stdout.write(`  Checked ${Math.min(i + batchSize, ACTION_ICON_LIBRARY.length)}/${ACTION_ICON_LIBRARY.length}\r`)
  }
  
  console.log('\n')
  
  const valid = results.filter(r => r.valid)
  const invalid = results.filter(r => !r.valid)
  
  console.log(`Results: ${valid.length} valid, ${invalid.length} invalid\n`)
  
  if (invalid.length > 0) {
    console.log('Invalid icons:')
    for (const { icon, label } of invalid) {
      console.log(`  - ${icon} (${label})`)
    }
  }
}

main().catch(console.error)
