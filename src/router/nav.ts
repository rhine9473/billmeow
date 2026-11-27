/**
 * 导航项配置。
 *
 * 底部页签与宽屏侧边栏共用同一份列表，保证两套导航的目标、文案与图标
 * 永远一致；新增页面时只需改这里一处。
 *
 * @remarks
 * 图标通过 `unplugin-icons` 在编译期内联为 SVG，不产生额外网络请求。
 */
import type { Component } from 'vue'

import IconAccounts from '~icons/material-symbols/account-balance-wallet-outline'
import IconRecord from '~icons/material-symbols/add-rounded'
import IconRecords from '~icons/material-symbols/list-alt-outline'
import IconSettings from '~icons/material-symbols/settings-rounded'
import IconStats from '~icons/material-symbols/data-usage-rounded'

/** 单个导航项 */
export interface NavItem {
  /** 目标路由名 */
  name: string
  /** 导航文案 */
  label: string
  /** 导航图标 */
  icon: Component
  /** 是否为强引导项（记一笔），在移动端以实心圆突出 */
  primary?: boolean
}

/**
 * 全站导航项，顺序即展示顺序。
 * 移动端底部页签与宽屏侧边栏都按此顺序渲染。
 */
export const NAV_ITEMS: NavItem[] = [
  { name: 'stats', label: '统计', icon: IconStats },
  { name: 'records', label: '账单', icon: IconRecords },
  { name: 'record', label: '记一笔', icon: IconRecord, primary: true },
  { name: 'accounts', label: '账户', icon: IconAccounts },
  { name: 'settings', label: '设置', icon: IconSettings },
]
