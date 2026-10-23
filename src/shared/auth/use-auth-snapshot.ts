/**
 * `useAuthSnapshot()`：UI 侧读快照的 React hook。
 *
 * 单独成文件（不塞进 `facade.ts`）的**唯一原因**：`facade.ts` 需要能被 background 安全引用，
 * 而 background 不该因为一个 hook 把 react 拉进 service worker 的 bundle。
 * 边界规则把两者都列入白名单（见 `scripts/check-auth-boundary.ts`）。
 *
 * 行为：订阅 → 首帧 `readAuthSnapshot()` → **不发起任何网络请求**（权益刷新由 background 负责）。
 * 顺序不能反（先读后订阅会丢 await 窗口里的变化，见下方注释）。
 */
import { useEffect, useState } from "react"
import type { AuthSnapshot } from "@/shared/auth/types"
import { readAuthSnapshot, signedOutSnapshot, subscribeAuthSnapshot } from "@/shared/auth/facade"

export function useAuthSnapshot(): { snapshot: AuthSnapshot; loading: boolean } {
  const [snapshot, setSnapshot] = useState<AuthSnapshot>(signedOutSnapshot)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let alive = true
    /** 订阅后是否已经收到过变化：收到过就不能再让初始读的旧值盖回去 */
    let sawUpdate = false

    // **订阅必须先注册**：`readAuthSnapshot()` 是异步的，先读后订阅会让 await 窗口里
    // 到达的变化被「更旧」的初始值覆盖（表现：登录成功后 Popup 闪回未登录）。
    const unsubscribe = subscribeAuthSnapshot((value) => {
      if (!alive) return
      sawUpdate = true
      setSnapshot(value)
      setLoading(false)
    })

    void readAuthSnapshot().then((value) => {
      if (!alive || sawUpdate) return
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
