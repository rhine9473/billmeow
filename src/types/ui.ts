/**
 * 币种与账户的展示属性（纯 UI 层）。
 *
 * @remarks
 * **分层契约**：本文件只放展示声明与静态常量，可以 import `./bill`，
 * 但 `bill.ts` 不得反过来 import 本文件。需要把业务数据与展示属性组合时，
 * 写到 `src/lib/` 的纯函数，不要在这里读 store 或写组件逻辑。
 */

import type { CurrencyCode } from './bill'

/**
 * 币种的展示元数据。
 *
 * 与 `./bill.ts` 的 `CurrencyMeta` 分工：
 * - `CurrencyMeta`：只管**换算怎么算**（`decimals`）
 * - `CurrencyDisplay`：只管**界面怎么显示**（`label` + `symbol`）
 *
 * 名称后续接入多语言时，把 `label` 换成 i18n 键即可，不影响计算逻辑。
 */
export interface CurrencyDisplay {
  /** 币种名称，界面下拉与列表使用 */
  label: string
  /** 货币符号，不保证唯一（如 CNY / JPY 都是 ¥） */
  symbol: string
}

/**
 * 全部币种的展示信息。
 *
 * 类型是 `Record<CurrencyCode, CurrencyDisplay>`，因此 {@link CurrencyCode}
 * 新增币种时这里漏写会在**编译期**报错。
 *
 * @example
 * CURRENCY_DISPLAY.CNY.label   // '人民币'
 * CURRENCY_DISPLAY.CNY.symbol  // '¥'
 */
export const CURRENCY_DISPLAY: Readonly<Record<CurrencyCode, CurrencyDisplay>> = {
  CNY: { label: '人民币', symbol: '¥' },
  USD: { label: '美元', symbol: '$' },
  EUR: { label: '欧元', symbol: '€' },
  JPY: { label: '日元', symbol: '¥' },
  HKD: { label: '港币', symbol: 'HK$' },
  TWD: { label: '新台币', symbol: 'NT$' },
  CAD: { label: '加元', symbol: 'C$' },
  GBP: { label: '英镑', symbol: '£' },
  CHF: { label: '瑞士法郎', symbol: 'CHF' },
  AUD: { label: '澳元', symbol: 'A$' },
  SGD: { label: '新加坡元', symbol: 'S$' },
  KRW: { label: '韩元', symbol: '₩' },
  THB: { label: '泰铢', symbol: '฿' },
  VND: { label: '越南盾', symbol: '₫' },
}

/**
 * 按币种代码取展示信息。
 *
 * @param code 币种代码
 * @returns 该币种的名称与符号
 * @throws 当 `code` 不在 {@link CURRENCY_DISPLAY} 中时抛出
 * @example
 * getCurrencyDisplay('JPY').symbol  // '¥'
 */
export function getCurrencyDisplay(code: CurrencyCode): CurrencyDisplay {
  const display = CURRENCY_DISPLAY[code]
  if (!display) throw new Error(`未知币种: ${code}`)
  return display
}

/**
 * 账户的视觉样式（纯 UI 层）。
 *
 * 与 `src/types/bill.ts` 的 `Account` 分开存放：`Account` 只存业务数据，
 * 用户给账户挑的图标和颜色是实现「好看」用的，改错了不影响任何金额计算。
 *
 * 按 `Account.id` 索引，没有配样式的账户走默认样式。
 *
 * @remarks
 * `icon` 与 `color` 可以同时存在——常见做法是用 `color` 做背景、
 * `icon` 做前景图形。两者都是可选的，都没有时 UI 自行兜底。
 */
export interface AccountVisual {
  /** 图标名（iconify 格式，如 `mdi:bank`） */
  icon?: string
  /** 主题色（CSS 颜色值，如 `#4f46e5`），通常用作卡片/图标底色 */
  color?: string
}

/**
 * 账户的视觉样式表，以 `Account.id` 为键。
 *
 * 没配样式的账户取到 `undefined`，调用方需自行兜底默认样式。
 *
 * @example
 * const visuals: AccountVisualMap = { 'acc-1': { icon: 'mdi:bank', color: '#4f46e5' } }
 */
export type AccountVisualMap = Readonly<Record<string, AccountVisual | undefined>>

/**
 * 账户分组（纯 UI 层）。
 *
 * 用于把多个账户在界面归到一行/一组展示，例如「招商银行」下面挂着
 * CNY 与 USD 两个子账户。
 *
 * @remarks
 * **分组只影响展示，不影响统计**：总资产仍按每个 `Account` 单独计算，
 * 分组只是让列表更清爽。因此分组信息不写进 `Account`，也不参与任何
 * 金额汇总逻辑。
 *
 * 另见：如果想按「同一张卡」自动分组，`Account.cardTail` 也能作为依据，
 * 不一定要用户手动建组。
 */
export interface AccountGroup {
  /** 唯一标识（建议 `crypto.randomUUID()`） */
  id: string
  /** 分组名称，如「招商银行」 */
  name: string
  /** 排序序号，数值小的排前面 */
  order?: number
}

/**
 * 账户到分组的归属关系，`Account.id` → `AccountGroup.id`。
 *
 * 未分组的账户取到 `undefined`，调用方需自行兜底（直接平铺展示）。
 *
 * @example
 * const groupOf: AccountGroupMap = { 'acc-1': 'group-cmb' }
 */
export type AccountGroupMap = Readonly<Record<string, string | undefined>>

