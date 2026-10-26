/**
 * 结算后轮询的**决策**（纯函数，无定时器、无 I/O）。
 *
 * 为什么把它从 `SubscriptionCard.tsx` 里抽出来：轮询逻辑写在组件里只能靠手测
 * （项目不引 jsdom），而这里有三个必须被断言的分支 ——
 * 「命中且是升级」「命中但是降级（只停不上报）」「次数用完给超时，不能假装成功」。
 * 抽成纯函数后，这三条都能进 `npm test`。
 */
import type { PlanId } from "@/shared/auth/types"
import { hasPlanChanged, isPlanUpgrade } from "@/shared/auth/types"

export type UpgradePollStep =
  /** 还没变化，继续等下一次 */
  | { kind: "continue" }
  /** 档位变了（任意方向）。`upgraded` 决定要不要上报 `subscription_activated` */
  | { kind: "changed"; plan: PlanId; upgraded: boolean }
  /** 次数用完，仍未确认到变化：提示用户稍后重开页面，**不当作成功** */
  | { kind: "timeout" }

export function nextPollStep(input: {
  /** 点「选择」那一刻的档位（基线） */
  baselinePlan: PlanId
  /** 本次拉到的档位；`null` = 这次没拿到（保留旧状态，继续等） */
  nextPlan: PlanId | null
  /** 已尝试次数（含本次） */
  attempts: number
  maxAttempts: number
}): UpgradePollStep {
  const { baselinePlan, nextPlan, attempts, maxAttempts } = input
  if (nextPlan && hasPlanChanged(baselinePlan, nextPlan)) {
    return { kind: "changed", plan: nextPlan, upgraded: isPlanUpgrade(baselinePlan, nextPlan) }
  }
  if (attempts >= maxAttempts) return { kind: "timeout" }
  return { kind: "continue" }
}
