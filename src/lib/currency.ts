import { CURRENCY_MAP, type CurrencyCode, type CurrencyMeta } from '../types/bill'
import { CURRENCY_DISPLAY, type CurrencyDisplay } from '../types/ui'

/**
 * 币种查表与校验工具。
 *
 * 只做「只读查询 + 类型守卫」，不持有状态、不碰 UI、不依赖存储。
 * 币种数据本身（`CURRENCY_MAP` / `CURRENCY_DISPLAY`）留在 `src/types/`，属于纯声明。
 */

/**
 * 按币种代码取计算元数据。
 *
 * 参数类型是 {@link CurrencyCode}，正常调用时 `if` 分支不可达；
 * 保留它是为了拦住用 `as CurrencyCode` 强转进来的脏数据。
 *
 * 非法代码抛错而不是静默回退到人民币：
 * 静默回退会让「币种写错」这类 bug 一直藏到金额显示异常时才暴露。
 * 外部数据的校验见 {@link isCurrencyCode}。
 *
 * @param code 币种代码
 * @returns 对应的币种元数据
 * @throws 当 `code` 不在 `CURRENCY_MAP` 中时抛出
 * @example
 * getCurrency('JPY').decimals  // 0
 */
export function getCurrency(code: CurrencyCode): CurrencyMeta {
  const meta = CURRENCY_MAP[code]
  if (!meta) throw new Error(`未知币种: ${code}`)
  return meta
}

/**
 * 按币种代码取小数位数，等价于 `getCurrency(code).decimals`。
 *
 * @param code 币种代码
 * @returns 该币种的小数位数
 */
export function getCurrencyDecimals(code: CurrencyCode): number {
  return getCurrency(code).decimals
}

/**
 * 判断任意值是否为受支持的币种代码。
 *
 * 用于持久化层（A2）校验从存储或导入文件读回的数据：
 * 这些数据在静态类型上不可信，必须先过一遍守卫再交给 {@link getCurrency}。
 *
 * 用 `Object.hasOwn` 而不是 `in`：后者会命中原型链，
 * `'toString' in CURRENCY_MAP` 为 `true`，会把 `toString` 误判成合法币种。
 *
 * @param value 待校验的值，类型未知
 * @returns 是合法币种代码时为 `true`，并收窄为 {@link CurrencyCode}
 * @example
 * isCurrencyCode('CNY')       // true
 * isCurrencyCode('toString')  // false（`in` 运算符会误判为 true）
 */
export function isCurrencyCode(value: unknown): value is CurrencyCode {
  return typeof value === 'string' && Object.hasOwn(CURRENCY_MAP, value)
}

/**
 * 按币种代码取展示信息（名称与符号）。
 *
 * @param code 币种代码
 * @returns 该币种的名称与符号
 * @throws 当 `code` 不在 `CURRENCY_DISPLAY` 中时抛出
 * @example
 * getCurrencyDisplay('JPY').symbol  // '¥'
 */
export function getCurrencyDisplay(code: CurrencyCode): CurrencyDisplay {
  const display = CURRENCY_DISPLAY[code]
  if (!display) throw new Error(`未知币种: ${code}`)
  return display
}
