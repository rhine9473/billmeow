import { describe, expect, it } from 'vitest'
import { CURRENCY_DISPLAY } from './ui'
import { CURRENCY_MAP, type CurrencyCode } from './bill'

describe('CURRENCY_DISPLAY', () => {
  it('与 CURRENCY_MAP 的键集完全一致', () => {
    /* 两张表都靠 Record<CurrencyCode, ...> 约束，但若将来有人改成 Partial
       或手动维护，这条能第一时间发现漏项 */
    expect(Object.keys(CURRENCY_DISPLAY).sort()).toEqual(Object.keys(CURRENCY_MAP).sort())
  })

  it('每个币种的名称与符号都非空', () => {
    for (const [code, display] of Object.entries(CURRENCY_DISPLAY)) {
      expect(display.label.trim(), `${code}.label 不应为空`).not.toBe('')
      expect(display.symbol.trim(), `${code}.symbol 不应为空`).not.toBe('')
    }
  })

  it('已知共用符号的币种只有 CNY / JPY（同为 ¥）', () => {
    /* 其余币种的符号应唯一：复制粘贴配错（如把 KRW 的 ₩ 写成 VND 的 ₫）
       不会报错也不会崩，只能靠这条揪出来 */
    const sharedSymbol = '¥'
    const usersOfShared = (Object.entries(CURRENCY_DISPLAY) as [CurrencyCode, { symbol: string }][])
      .filter(([, display]) => display.symbol === sharedSymbol)
      .map(([code]) => code)
      .sort()

    expect(usersOfShared).toEqual(['CNY', 'JPY'])
  })

  it('符号重复只允许出现在预期内的组合', () => {
    const symbolToCodes = new Map<string, CurrencyCode[]>()
    for (const [code, display] of Object.entries(CURRENCY_DISPLAY) as [
      CurrencyCode,
      { symbol: string },
    ][]) {
      symbolToCodes.set(display.symbol, [...(symbolToCodes.get(display.symbol) ?? []), code])
    }

    const duplicated = [...symbolToCodes.entries()].filter(([, codes]) => codes.length > 1)

    /* 目前只有 ¥ 被两个币种共用，新增共用关系时这条会失败，
       提醒确认是有意为之还是配错 */
    expect(duplicated).toHaveLength(1)
    expect(duplicated[0][0]).toBe('¥')
  })
})
