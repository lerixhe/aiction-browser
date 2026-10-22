/**
 * `useAuthSnapshot()`：UI 侧读快照的 React hook。
 *
 * 单独成文件（不塞进 `facade.ts`）的**唯一原因**：`facade.ts` 需要能被 background 安全引用，
 * 而 background 不该因为一个 hook 把 react 拉进 service worker 的 bundle。
 * 边界规则把两者都列入白名单（见 `scripts/check-auth-boundary.ts`）。
 *
 * 行为：首帧 `readAuthSnapshot()` → 订阅 → **不发起任何网络请求**（权益刷新由 background 负责）。
 */
import { useEffect, useState } from "react"
import type { AuthSnapshot } from "@/shared/auth/types"
import { readAuthSnapshot, signedOutSnapshot, subscribeAuthSnapshot } from "@/shared/auth/facade"

export function useAuthSnapshot(): { snapshot: AuthSnapshot; loading: boolean } {
  const [snapshot, setSnapshot] = useState<AuthSnapshot>(signedOutSnapshot)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let alive = true

    void readAuthSnapshot().then((value) => {
      if (!alive) return
      setSnapshot(value)
      setLoading(false)
    })

    const unsubscribe = subscribeAuthSnapshot((value) => {
      if (!alive) return
      setSnapshot(value)
      setLoading(false)
    })

    return () => {
      alive = false
      unsubscribe()
    }
  }, [])

  return { snapshot, loading }
}
