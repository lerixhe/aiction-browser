/**
 * CTA 数据与订阅状态文案的护栏（SPEC §6.8 / §8.1）。
 *
 * 这里守的是两类**只在用户眼前才暴露**的错误：
 * 1. 订阅状态拼成动态键后缀（`past_due` vs `pastDue`）→ 界面显示键名原文，
 *    而 `check:i18n` 静态查不到模板字符串，编译与 CI 全绿；
 * 2. CTA 的目标路由写错 → `OPEN_WEB_PAGE` 在 background 被白名单拒掉 → 点了没反应。
 *
 * 两条都只能靠「枚举 × 字典」的交叉断言兜住。
 */
import { describe, expect, it } from "vitest"

import {
  SUBSCRIPTION_STATUS_KEYS,
  logInAction,
  manageSubscriptionAction,
  subscriptionStatusKey,
  upgradeAction
} from "@/shared/auth/actions"
import type { Subscription } from "@/shared/auth/types"
import { OPEN_WEB_PAGE_ROUTES } from "@/shared/constants"
import en from "@/shared/i18n/locales/en"

const ALL_STATUSES: Subscription["status"][] = [
  "active",
  "trialing",
  "past_due",
  "canceled",
  "expired",
  "none"
]

/** 假翻译器：直接返回键名，便于断言「拿到的是哪个键」 */
const identityT = (key: string) => key

describe("订阅状态 → i18n 键", () => {
  it("覆盖全部状态值，且每个键在字典里真实存在", () => {
    for (const status of ALL_STATUSES) {
      const key = subscriptionStatusKey(status)
      expect(key, `状态 ${status} 没有对应的键`).toBeTruthy()
      expect(en[key as keyof typeof en], `键 ${key} 在 en 字典里不存在`).toBeTruthy()
    }
  })

  it("past_due 映射到驼峰键（服务端下划线 → 字典驼峰，曾经拼错并显示键名原文）", () => {
    expect(subscriptionStatusKey("past_due")).toBe("options.account.status.pastDue")
    expect(en["options.account.status.pastDue"]).toBeTruthy()
  })

  it("未知状态回退到 none，而不是把键名拼到界面上", () => {
    expect(subscriptionStatusKey("paused")).toBe(SUBSCRIPTION_STATUS_KEYS.none)
  })
})

describe("CTA 数据", () => {
  it("所有产出的 route 都在 OPEN_WEB_PAGE 白名单里（否则 background 会拒，点了没反应）", () => {
    const actions = [logInAction(identityT), upgradeAction(identityT), manageSubscriptionAction(identityT)]

    for (const action of actions) {
      expect(OPEN_WEB_PAGE_ROUTES as readonly string[]).toContain(action.route)
    }
  })

  it("可结构化克隆（要跨 runtime 消息传，函数过不去）", () => {
    for (const action of [logInAction(identityT), upgradeAction(identityT), manageSubscriptionAction(identityT)]) {
      expect(JSON.parse(JSON.stringify(action))).toEqual(action)
      expect(Object.values(action).every((value) => typeof value === "string")).toBe(true)
    }
  })

  it("催缴 ≠ 升级：manage 落账单页，upgrade 落定价页", () => {
    expect(manageSubscriptionAction(identityT).route).toBe("billing")
    expect(upgradeAction(identityT).route).toBe("pricing")
    expect(manageSubscriptionAction(identityT).kind).toBe("manage")
    expect(upgradeAction(identityT).kind).toBe("upgrade")
  })
})
