/**
 * 账号相关的 CTA 数据（SPEC §6.8）。
 *
 * 为什么是「数据」而不是回调：CTA 要能跨 `runtime.Port` / `sendMessage` 传输，
 * 也要能直接在单测里断言。一个闭包既过不了结构化克隆，也没法快照。
 *
 * **催缴 ≠ 升级**：`past_due` 给的是 `manage`（去账单页改支付方式），不是 `upgrade`（去定价页）。
 * 这两件事混在一起，用户会在「卡失效」的时候被推去买更贵的档。
 *
 * **产出的是路由名，不是 URL**：外链地址由 background 用 `WEB_BASE` 拼（`OPEN_WEB_PAGE`）。
 * 原因有二 —— ① `chrome.tabs` 不暴露给 content script，内容页里的外链必须由 background 代开；
 * ② 让内容脚本持有完整外部地址会把一个「可被页面触达的消息通道」变成任意的 URL 打开器。
 * 因此本模块也不 import `config.ts`：它的产物是纯枚举 + 本地化文案。
 */
import type { OpenWebPageRoute } from "@/shared/constants"
import type { Subscription } from "@/shared/auth/types"
import type { PlanId } from "@/shared/auth/types"
import type { MessageKey } from "@/shared/i18n/locales/en"

export interface AuthAction {
  /** 已本地化的展示文案 */
  label: string
  /** 目标官网路由名（由 background 拼成完整地址；扩展内不内嵌支付，只开外链） */
  route: OpenWebPageRoute
  /** 动作类型：登录类落点在扩展内（`OPEN_OPTIONS`），其余落点在官网 */
  kind: "login" | "upgrade" | "manage"
}

type Translate = (key: string, substitutions?: string[]) => string

function build(kind: AuthAction["kind"], label: string, route: OpenWebPageRoute): AuthAction {
  return { kind, label, route }
}

/**
 * 登录 CTA。文案刻意是「前往设置登录」而不是「登录」：
 * 面板里的这个按钮会把用户从内容页带走，必须提前说清落点（唯一消费方是面板失败态）。
 * 落点其实是 Options 的 `#account`（`kind: "login"`），`route` 只在将来改成外链时才有意义。
 */
export function logInAction(t: Translate): AuthAction {
  return build("login", t("chat.signInCta"), "login")
}

export function upgradeAction(t: Translate): AuthAction {
  return build("upgrade", t("options.account.upgrade"), "pricing")
}

export function manageSubscriptionAction(t: Translate): AuthAction {
  return build("manage", t("options.account.manage"), "billing")
}

/**
 * 订阅状态 → i18n 键。**两个维度都由编译期守住**：
 * - `Record<Subscription["status"], MessageKey>` 保证每个状态值都有键（服务端新增状态时编译报错）；
 * - `MessageKey` 保证键名真实存在（拼错键名编译报错）。
 *
 * 为什么不能用 `t(`options.account.status.${status}`)`：服务端枚举是 `past_due`（下划线），
 * 而键是 `pastDue`（驼峰）。拼错的结果是 `i18nStore.t()` 把**键名原文**渲染到界面上，
 * 而 `check:i18n` 查不到动态模板字符串 —— 编译、CI、单测全绿，只有扣款失败的用户看得见错。
 */
export const SUBSCRIPTION_STATUS_KEYS: Record<Subscription["status"], MessageKey> = {
  active: "options.account.status.active",
  trialing: "options.account.status.trialing",
  past_due: "options.account.status.pastDue",
  canceled: "options.account.status.canceled",
  expired: "options.account.status.expired",
  none: "options.account.status.none"
}

export function subscriptionStatusKey(status: string): MessageKey {
  return SUBSCRIPTION_STATUS_KEYS[status as Subscription["status"]] ?? SUBSCRIPTION_STATUS_KEYS.none
}

/**
 * 套餐档位 → i18n 键（与上面的订阅状态同一个理由）。
 *
 * 不要写 `t(`options.account.plan.${plan}`)`：模板字符串进不了 `check:i18n` 的检查，
 * 服务端新增一个档位时 7 种语言会同时缺键，而编译期 / CI 全绿，
 * 只有用户能在界面上看到键名原文（P1-1 的真实事故）。
 */
export const PLAN_KEYS: Record<PlanId, MessageKey> = {
  anonymous: "options.account.plan.anonymous",
  free: "options.account.plan.free",
  pro: "options.account.plan.pro",
  max: "options.account.plan.max"
}

export function planLabelKey(plan: string): MessageKey {
  return PLAN_KEYS[plan as PlanId] ?? PLAN_KEYS.free
}
