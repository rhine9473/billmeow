import { describe, expect, it } from 'vitest'
import {
  getCurrency,
  getCurrencyDecimals,
  getCurrencyDisplay,
  isCurrencyCode,
} from './currency'
import { CURRENCY_MAP, type CurrencyCode } from '../types/bill'
import { CURRENCY_DISPLAY } from '../types/ui'

describe('getCurrency / getCurrencyDecimals', () => {
  it('按币种返回对应小数位，与 CURRENCY_MAP 一致', () => {
    for (const [code, meta] of Object.entries(CURRENCY_MAP) as [
      CurrencyCode,
      { decimals: number },
    ][]) {
      expect(getCurrency(code)).toBe(meta)
      expect(getCurrencyDecimals(code)).toBe(meta.decimals)
    }
  })

  it('被 as 强转的非法币种会抛错，不会静默回退人民币', () => {
    expect(() => getCurrency('XXX' as CurrencyCode)).toThrow('未知币种')
    expect(() => getCurrencyDecimals('XXX' as CurrencyCode)).toThrow('未知币种')
  })
})

describe('getCurrencyDisplay', () => {
  it('返回币种的名称与符号', () => {
    expect(getCurrencyDisplay('CNY')).toEqual({ label: '人民币', symbol: '¥' })
    expect(getCurrencyDisplay('JPY').symbol).toBe('¥')
    expect(getCurrencyDisplay('KRW').label).toBe('韩元')
  })

  it('全部币种都能取到展示信息，且与 CURRENCY_DISPLAY 是同一引用', () => {
    for (const code of Object.keys(CURRENCY_DISPLAY) as CurrencyCode[]) {
      expect(getCurrencyDisplay(code)).toBe(CURRENCY_DISPLAY[code])
    }
  })

  it('非法币种抛错而不是返回空值', () => {
    expect(() => getCurrencyDisplay('XXX' as CurrencyCode)).toThrow('未知币种')
  })
})

describe('isCurrencyCode', () => {
  it('识别合法币种', () => {
    expect(isCurrencyCode('CNY')).toBe(true)
    expect(isCurrencyCode('VND')).toBe(true)
  })

  it('拒绝非法值与非字符串', () => {
    expect(isCurrencyCode('XXX')).toBe(false)
    expect(isCurrencyCode('')).toBe(false)
    expect(isCurrencyCode(undefined)).toBe(false)
    expect(isCurrencyCode(null)).toBe(false)
    expect(isCurrencyCode(0)).toBe(false)
    expect(isCurrencyCode({ code: 'CNY' })).toBe(false)
  })

  it('不会把原型链上的属性误判为币种', () => {
    /* 用 Object.hasOwn 而非 in 的原因：in 会命中 Object.prototype */
    expect(isCurrencyCode('toString')).toBe(false)
    expect(isCurrencyCode('constructor')).toBe(false)
    expect(isCurrencyCode('hasOwnProperty')).toBe(false)
  })

  it('与 CURRENCY_MAP 的键集完全一致', () => {
    for (const code of Object.keys(CURRENCY_MAP)) {
      expect(isCurrencyCode(code)).toBe(true)
    }
  })
})
