export interface IconEntry {
  icon: string
  label: string
}

export interface IconCategory {
  name: string
  icons: IconEntry[]
}

export const ACTION_ICON_LIBRARY: IconCategory[] = [
  {
    name: "AI & Magic",
    icons: [
      { icon: "tabler:sparkles", label: "Sparkles" },
      { icon: "tabler:wand", label: "Wand" },
      { icon: "tabler:brain", label: "Brain" },
      { icon: "tabler:robot", label: "Robot" },
      { icon: "tabler:bulb", label: "Bulb" },
      { icon: "tabler:magic-wand", label: "Magic Wand" },
      { icon: "tabler:star", label: "Star" },
      { icon: "tabler:stars", label: "Stars" },
    ]
  },
  {
    name: "Text",
    icons: [
      { icon: "tabler:language", label: "Translate" },
      { icon: "tabler:alphabet-latin", label: "Alphabet" },
      { icon: "tabler:article", label: "Article" },
      { icon: "tabler:edit", label: "Edit" },
      { icon: "tabler:pencil", label: "Pencil" },
      { icon: "tabler:typography", label: "Typography" },
      { icon: "tabler:align-left", label: "Align" },
      { icon: "tabler:file-text", label: "File Text" },
    ]
  },
  {
    name: "Communication",
    icons: [
      { icon: "tabler:message-circle", label: "Chat" },
      { icon: "tabler:message", label: "Message" },
      { icon: "tabler:messages", label: "Messages" },
      { icon: "tabler:mail", label: "Mail" },
      { icon: "tabler:send", label: "Send" },
      { icon: "tabler:thumb-up", label: "Like" },
      { icon: "tabler:thumb-down", label: "Dislike" },
    ]
  },
  {
    name: "Analysis",
    icons: [
      { icon: "tabler:search", label: "Search" },
      { icon: "tabler:zoom-question", label: "Question" },
      { icon: "tabler:chart-bar", label: "Chart" },
      { icon: "tabler:eye", label: "View" },
      { icon: "tabler:report-analytics", label: "Analytics" },
      { icon: "tabler:help-circle", label: "Help" },
      { icon: "tabler:info-circle", label: "Info" },
    ]
  },
  {
    name: "Code",
    icons: [
      { icon: "tabler:code", label: "Code" },
      { icon: "tabler:terminal", label: "Terminal" },
      { icon: "tabler:bug", label: "Bug" },
      { icon: "tabler:git-branch", label: "Branch" },
      { icon: "tabler:server", label: "Server" },
      { icon: "tabler:database", label: "Database" },
    ]
  },
  {
    name: "Actions",
    icons: [
      { icon: "tab:arrow-right", label: "Arrow" },
      { icon: "tabler:copy", label: "Copy" },
      { icon: "tabler:check", label: "Check" },
      { icon: "tabler:x", label: "Close" },
      { icon: "tabler:refresh", label: "Refresh" },
      { icon: "tabler:download", label: "Download" },
      { icon: "tabler:share", label: "Share" },
      { icon: "tabler:bookmark", label: "Bookmark" },
      { icon: "tabler:heart", label: "Heart" },
    ]
  },
  {
    name: "Objects",
    icons: [
      { icon: "tabler:book", label: "Book" },
      { icon: "tabler:books", label: "Books" },
      { icon: "tabler:note", label: "Note" },
      { icon: "tabler:notebook", label: "Notebook" },
      { icon: "tabler:list", label: "List" },
      { icon: "tabler:calendar", label: "Calendar" },
      { icon: "tabler:clock", label: "Clock" },
      { icon: "tabler:flag", label: "Flag" },
      { icon: "tabler:tag", label: "Tag" },
    ]
  }
]

export const ALL_ACTION_ICONS: IconEntry[] = ACTION_ICON_LIBRARY.flatMap((cat) => cat.icons)
