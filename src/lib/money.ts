/**
 * 金额工具：整数最小单位与主单位（元）的互转、输入解析与多币种格式化。
 *
 * @remarks
 * 全项目金额一律以「整数最小单位」存储与计算，主单位（元）只出现在两个边界：
 * 用户输入与界面展示，本模块是这两个边界的唯一关口。
 *
 * 分层：
 * - 纯数学函数（`toMinor` / `toMajor` / `parseAmount` / `formatMinor`）只认
 *   `decimals`，不依赖币种表，可独立单测；
 * - 币种包装函数（`parseAmountForCurrency` / `formatMoney`）负责从
 *   `types/bill` 与 `types/ui` 查表，属于约定中的「跨文件组合逻辑」。
 *
 * 倍数一律按 `10 ** decimals` 计算，不硬编码 100（JPY / KRW / VND 无小数位）。
 *
 * @see ../types/README.md
 */

import { getCurrencyDecimals, getCurrencyDisplay } from './currency'
import type { CurrencyCode } from '../types/bill'

/**
 * 把元金额（小数数字）换算为整数最小单位。
 *
 * `Math.round` 不能省：部分十进制小数在二进制浮点中无法精确表示，
 * 乘法结果会带尾巴（如 `0.29 * 100 === 28.999999999999996`），
 * 不四舍五入会被截成少一分。
 *
 * @param amount 以主单位（元）表示的数字
 * @param decimals 该币种的小数位数（用 `getCurrencyDecimals` 查）
 * @returns 整数最小单位
 * @example
 * toMinor(8.55, 2)  // 855
 * toMinor(314, 0)   // 314（JPY 无小数位）
 */
export function toMinor(amount: number, decimals: number): number {
  return Math.round(amount * 10 ** decimals)
}

/**
 * 把整数最小单位换算回元金额（小数数字）。
 *
 * 供汇率反推、图表比例等需要参与浮点运算的场景使用；
 * 存储与汇总一律保持整数最小单位，不要经过本函数。
 *
 * @param minor 整数最小单位
 * @param decimals 该币种的小数位数
 * @returns 以主单位（元）表示的数字
 * @example
 * toMajor(855, 2)  // 8.55
 */
export function toMajor(minor: number, decimals: number): number {
  return minor / 10 ** decimals
}

/**
 * 解析用户输入的金额字符串，换算为整数最小单位。
 *
 * 校验规则：
 * - 只接受纯十进制数字，可带一个可选的小数部分；
 *   不接受负号（方向由 `domain` 字段表达）、科学计数法与千分位逗号；
 * - 小数位数超过 `decimals` 直接拒绝，不做静默截断；
 * - 结果必须是安全整数（`Number.isSafeInteger`），拦截超限与 `NaN`；
 * - 整数段与小数段分开换算后相加，全程整数运算，避免浮点乘法在安全整数上限附近差 1 分。
 *
 * @param input 用户输入的金额字符串（首尾空白会被忽略）
 * @param decimals 该币种的小数位数
 * @returns 整数最小单位；非法输入返回 `null`
 * @example
 * parseAmount('12.34', 2)  // 1234
 * parseAmount('1.005', 2)  // null（小数位超限）
 * parseAmount('1.5', 0)    // null（JPY 无小数位）
 * parseAmount('abc', 2)    // null
 */
export function parseAmount(input: string, decimals: number): number | null {
  const text = input.trim()
  if (!/^\d+(\.\d+)?$/.test(text)) return null

  /* 小数位数直接数出来，不拼动态正则——decimals 为 0 时会构造出 \d{1,0} 这样的非法量词 */
  const dot = text.indexOf('.')
  const frac = dot === -1 ? 0 : text.length - dot - 1
  if (frac > decimals) return null

  /* 整数段与小数段分开换算后相加，全程整数运算：先转浮点再乘幂在安全整数上限附近会差 1 分 */
  const [integer, fraction = ''] = text.split('.')
  const minor = Number(integer) * 10 ** decimals + Number(fraction.padEnd(decimals, '0'))
  return Number.isSafeInteger(minor) ? minor : null
}

/**
 * 把整数最小单位格式化为带千分位的金额文本（不含货币符号）。
 *
 * 全程整数运算，不经过浮点，也不用 `toFixed`。
 * 小数部分按 `decimals` 补零；`decimals` 为 0 时没有小数点（JPY 等）。
 *
 * @param minor 整数最小单位（可为负，如账户余额、净资产）
 * @param decimals 该币种的小数位数
 * @returns 形如 `1,234.56` / `-1,234` 的文本
 * @example
 * formatMinor(123456, 2)   // '1,234.56'
 * formatMinor(5, 2)        // '0.05'
 * formatMinor(1234, 0)     // '1,234'
 * formatMinor(-123456, 2)  // '-1,234.56'
 */
export function formatMinor(minor: number, decimals: number): string {
  const factor = 10 ** decimals
  const sign = minor < 0 ? '-' : ''
  const abs = Math.abs(minor)
  const integer = Math.floor(abs / factor)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  const frac = decimals === 0 ? '' : `.${String(abs % factor).padStart(decimals, '0')}`

  return `${sign}${integer}${frac}`
}

/**
 * 按币种解析用户输入的金额字符串。
 *
 * 从 `types/bill` 查 `decimals` 后转交 {@link parseAmount}，
 * 校验规则与纯数学版一致。
 *
 * @param input 用户输入的金额字符串
 * @param currency 币种代码
 * @returns 整数最小单位；非法输入返回 `null`
 * @example
 * parseAmountForCurrency('12.34', 'CNY')  // 1234
 * parseAmountForCurrency('1.5', 'JPY')    // null
 */
export function parseAmountForCurrency(input: string, currency: CurrencyCode): number | null {
  return parseAmount(input, getCurrencyDecimals(currency))
}

/**
 * 把整数最小单位格式化为带货币符号的展示文本。
 *
 * 符号来自 `lib/currency` 的 `getCurrencyDisplay`；负号放在货币符号之前，
 * 形如 `-¥1,234.56`。
 *
 * @param minor 整数最小单位（可为负）
 * @param currency 币种代码
 * @returns 形如 `¥1,234.56` / `-¥1,234.56` / `¥1,234`（JPY）的文本
 * @example
 * formatMoney(123456, 'CNY')   // '¥1,234.56'
 * formatMoney(1234, 'JPY')     // '¥1,234'
 * formatMoney(-123456, 'CNY')  // '-¥1,234.56'
 */
export function formatMoney(minor: number, currency: CurrencyCode): string {
  const text = formatMinor(minor, getCurrencyDecimals(currency))
  const { symbol } = getCurrencyDisplay(currency)

  return text.startsWith('-') ? `-${symbol}${text.slice(1)}` : `${symbol}${text}`
}