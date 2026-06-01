import type { IconifyIcon } from "@iconify/react"

import sparkles from "@iconify/icons-tabler/sparkles"
import wand from "@iconify/icons-tabler/wand"
import brain from "@iconify/icons-tabler/brain"
import robot from "@iconify/icons-tabler/robot"
import bulb from "@iconify/icons-tabler/bulb"
import star from "@iconify/icons-tabler/star"
import stars from "@iconify/icons-tabler/stars"

import language from "@iconify/icons-tabler/language"
import alphabetLatin from "@iconify/icons-tabler/alphabet-latin"
import article from "@iconify/icons-tabler/article"
import edit from "@iconify/icons-tabler/edit"
import pencil from "@iconify/icons-tabler/pencil"
import typography from "@iconify/icons-tabler/typography"
import alignLeft from "@iconify/icons-tabler/align-left"
import fileText from "@iconify/icons-tabler/file-text"

import messageCircle from "@iconify/icons-tabler/message-circle"
import message from "@iconify/icons-tabler/message"
import messages from "@iconify/icons-tabler/messages"
import mail from "@iconify/icons-tabler/mail"
import send from "@iconify/icons-tabler/send"
import thumbUp from "@iconify/icons-tabler/thumb-up"
import thumbDown from "@iconify/icons-tabler/thumb-down"

import search from "@iconify/icons-tabler/search"
import zoomQuestion from "@iconify/icons-tabler/zoom-question"
import chartBar from "@iconify/icons-tabler/chart-bar"
import eye from "@iconify/icons-tabler/eye"
import reportAnalytics from "@iconify/icons-tabler/report-analytics"
import helpCircle from "@iconify/icons-tabler/help-circle"
import infoCircle from "@iconify/icons-tabler/info-circle"

import code from "@iconify/icons-tabler/code"
import terminal from "@iconify/icons-tabler/terminal"
import bug from "@iconify/icons-tabler/bug"
import gitBranch from "@iconify/icons-tabler/git-branch"
import server from "@iconify/icons-tabler/server"
import database from "@iconify/icons-tabler/database"

import arrowRight from "@iconify/icons-tabler/arrow-right"
import copy from "@iconify/icons-tabler/copy"
import check from "@iconify/icons-tabler/check"
import x from "@iconify/icons-tabler/x"
import refresh from "@iconify/icons-tabler/refresh"
import download from "@iconify/icons-tabler/download"
import share from "@iconify/icons-tabler/share"
import bookmark from "@iconify/icons-tabler/bookmark"
import heart from "@iconify/icons-tabler/heart"

import book from "@iconify/icons-tabler/book"
import books from "@iconify/icons-tabler/books"
import note from "@iconify/icons-tabler/note"
import notebook from "@iconify/icons-tabler/notebook"
import list from "@iconify/icons-tabler/list"
import calendar from "@iconify/icons-tabler/calendar"
import clock from "@iconify/icons-tabler/clock"
import flag from "@iconify/icons-tabler/flag"
import tag from "@iconify/icons-tabler/tag"

export const ICON_DATA: Record<string, IconifyIcon> = {
  "tabler:sparkles": sparkles as IconifyIcon,
  "tabler:wand": wand as IconifyIcon,
  "tabler:brain": brain as IconifyIcon,
  "tabler:robot": robot as IconifyIcon,
  "tabler:bulb": bulb as IconifyIcon,
  "tabler:star": star as IconifyIcon,
  "tabler:stars": stars as IconifyIcon,
  "tabler:language": language as IconifyIcon,
  "tabler:alphabet-latin": alphabetLatin as IconifyIcon,
  "tabler:article": article as IconifyIcon,
  "tabler:edit": edit as IconifyIcon,
  "tabler:pencil": pencil as IconifyIcon,
  "tabler:typography": typography as IconifyIcon,
  "tabler:align-left": alignLeft as IconifyIcon,
  "tabler:file-text": fileText as IconifyIcon,
  "tabler:message-circle": messageCircle as IconifyIcon,
  "tabler:message": message as IconifyIcon,
  "tabler:messages": messages as IconifyIcon,
  "tabler:mail": mail as IconifyIcon,
  "tabler:send": send as IconifyIcon,
  "tabler:thumb-up": thumbUp as IconifyIcon,
  "tabler:thumb-down": thumbDown as IconifyIcon,
  "tabler:search": search as IconifyIcon,
  "tabler:zoom-question": zoomQuestion as IconifyIcon,
  "tabler:chart-bar": chartBar as IconifyIcon,
  "tabler:eye": eye as IconifyIcon,
  "tabler:report-analytics": reportAnalytics as IconifyIcon,
  "tabler:help-circle": helpCircle as IconifyIcon,
  "tabler:info-circle": infoCircle as IconifyIcon,
  "tabler:code": code as IconifyIcon,
  "tabler:terminal": terminal as IconifyIcon,
  "tabler:bug": bug as IconifyIcon,
  "tabler:git-branch": gitBranch as IconifyIcon,
  "tabler:server": server as IconifyIcon,
  "tabler:database": database as IconifyIcon,
  "tabler:arrow-right": arrowRight as IconifyIcon,
  "tabler:copy": copy as IconifyIcon,
  "tabler:check": check as IconifyIcon,
  "tabler:x": x as IconifyIcon,
  "tabler:refresh": refresh as IconifyIcon,
  "tabler:download": download as IconifyIcon,
  "tabler:share": share as IconifyIcon,
  "tabler:bookmark": bookmark as IconifyIcon,
  "tabler:heart": heart as IconifyIcon,
  "tabler:book": book as IconifyIcon,
  "tabler:books": books as IconifyIcon,
  "tabler:note": note as IconifyIcon,
  "tabler:notebook": notebook as IconifyIcon,
  "tabler:list": list as IconifyIcon,
  "tabler:calendar": calendar as IconifyIcon,
  "tabler:clock": clock as IconifyIcon,
  "tabler:flag": flag as IconifyIcon,
  "tabler:tag": tag as IconifyIcon,
}

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
      { icon: "tabler:arrow-right", label: "Arrow" },
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
