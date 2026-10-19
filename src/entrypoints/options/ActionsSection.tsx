import type { ExtensionSettings } from "@/shared/types"
import { CustomActionsCard } from "./CustomActionsCard"
import { QuickActionsCard } from "./QuickActionsCard"

interface ActionsSectionProps {
  settings: ExtensionSettings
  saveSettingsNow: (updater: (current: ExtensionSettings) => ExtensionSettings) => void
}

/** AI 动作分区：快捷动作（纯即时项）+ 自定义动作（列表-详情 + 草稿） */
export function ActionsSection(props: ActionsSectionProps) {
  return (
    <>
      <QuickActionsCard {...props} />
      <CustomActionsCard {...props} />
    </>
  )
}
