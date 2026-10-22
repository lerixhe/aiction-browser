/**
 * 账号相关的 CTA 数据（SPEC §6.8）。
 *
 * 为什么是「数据」而不是回调：CTA 要能跨 `runtime.Port` / `sendMessage` 传输，
 * 也要能直接在单测里断言。一个闭包既过不了结构化克隆，也没法快照。
 *
 * **催缴 ≠ 升级**：`past_due` 给的是 `manage`（去账单页改支付方式），不是 `upgrade`（去定价页）。
 * 这两件事混在一起，用户会在「卡失效」的时候被推去买更贵的档。
 */
import { WEB_BASE, WEB_ROUTES } from "@/shared/auth/config"

export interface AuthAction {
  /** 已本地化的展示文案 */
  label: string
  /** 目标地址（官网；扩展内不内嵌支付，只开外链） */
  url: string
  kind: "login" | "upgrade" | "manage"
}

type Translate = (key: string, substitutions?: string[]) => string

function build(kind: AuthAction["kind"], label: string, path: string): AuthAction {
  return { kind, label, url: `${WEB_BASE}${path}` }
}

/**
 * 登录 CTA。文案刻意是「前往设置登录」而不是「登录」：
 * 面板里的这个按钮会把用户从内容页带走，必须提前说清落点（唯一消费方是面板失败态）。
 */
export function logInAction(t: Translate): AuthAction {
  return build("login", t("chat.signInCta"), WEB_ROUTES.login)
}

export function upgradeAction(t: Translate): AuthAction {
  return build("upgrade", t("options.account.upgrade"), WEB_ROUTES.pricing)
}

export function manageSubscriptionAction(t: Translate): AuthAction {
  return build("manage", t("options.account.manage"), WEB_ROUTES.billing)
}
