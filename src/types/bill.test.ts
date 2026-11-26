import { describe, expect, it } from 'vitest'
import {
  CURRENCY_MAP,
  getCurrency,
  getCurrencyDecimals,
  isCurrencyCode,
  resolveTransferKind,
  type Account,
  type Category,
  type CurrencyCode,
  type Transaction,
  type Transfer,
} from './bill'

describe('CURRENCY_MAP', () => {
  it('覆盖率全部币种，且小数位只有 0 与 2 两种', () => {
    const codes = Object.keys(CURRENCY_MAP) as CurrencyCode[]
    expect(codes.length).toBeGreaterThan(0)

    for (const code of codes) {
      /* 币种只有「无小数」和「两位小数」两类，出现 3 位说明数据写错了 */
      expect([0, 2]).toContain(CURRENCY_MAP[code].decimals)
    }
  })

  it('无小数币种固定为 JPY / KRW / VND', () => {
    const zeroDecimal = (Object.keys(CURRENCY_MAP) as CurrencyCode[]).filter(
      (code) => CURRENCY_MAP[code].decimals === 0,
    )
    expect(zeroDecimal.sort()).toEqual(['JPY', 'KRW', 'VND'])
  })
})

describe('getCurrency / getCurrencyDecimals', () => {
  it('按币种返回对应小数位，与 CURRENCY_MAP 一致', () => {
    for (const [code, meta] of Object.entries(CURRENCY_MAP) as [CurrencyCode, { decimals: number }][]) {
      expect(getCurrency(code)).toBe(meta)
      expect(getCurrencyDecimals(code)).toBe(meta.decimals)
      expect(getCurrencyDecimals(code)).toBe(meta.decimals)
    }
  })

  it('被 as 强转的非法币种会抛错，不会静默回退人民币', () => {
    expect(() => getCurrency('XXX' as CurrencyCode)).toThrow('未知币种')
  })
})

describe('isCurrencyCode', () => {
  it('识别合法币种', () => {
    expect(isCurrencyCode('CNY')).toBe(true)
    expect(isCurrencyCode('JPY')).toBe(true)
  })

  it('拒绝非法值与非字符串', () => {
    expect(isCurrencyCode('XXX')).toBe(false)
    expect(isCurrencyCode('')).toBe(false)
    expect(isCurrencyCode(undefined)).toBe(false)
    expect(isCurrencyCode(null)).toBe(false)
    expect(isCurrencyCode(123)).toBe(false)
    expect(isCurrencyCode({ code: 'CNY' })).toBe(false)
  })

  it('不会把原型链上的属性误判为币种', () => {
    /* 用 Object.hasOwn 而非 in 的原因：in 会命中 Object.prototype */
    expect(isCurrencyCode('toString')).toBe(false)
    expect(isCurrencyCode('constructor')).toBe(false)
    expect(isCurrencyCode('hasOwnProperty')).toBe(false)
  })
})

describe('resolveTransferKind', () => {
  it('按两侧账户类型推导转账语义', () => {
    expect(resolveTransferKind('asset', 'asset')).toBe('internal')
    expect(resolveTransferKind('asset', 'liability')).toBe('repayment')
    expect(resolveTransferKind('liability', 'asset')).toBe('borrowing')
    expect(resolveTransferKind('liability', 'liability')).toBe('liabilityInternal')
  })
})

describe('导出的实体类型可被引用', () => {
  it('四个实体能构造出合法对象（同时守住 A1 验收）', () => {
    const account: Account = {
      id: 'acc-1',
      name: '现金',
      kind: 'asset',
      currency: 'CNY',
      initialBalance: 0,
      archived: false,
    }

    const category: Category = {
      id: 'cat-1',
      name: '餐饮',
      domain: 'expense',
      builtin: true,
    }

    const transaction: Transaction = {
      id: 'tx-1',
      domain: 'expense',
      amount: 1234,
      currency: account.currency,
      categoryId: category.id,
      accountId: account.id,
      date: '2026-11-26',
      createdAt: 0,
      updatedAt: 0,
    }

    const transfer: Transfer = {
      id: 'tr-1',
      fromAccountId: 'acc-1',
      fromAmount: 10000,
      fromCurrency: 'USD',
      toAccountId: 'acc-2',
      toAmount: 73000,
      toCurrency: 'CNY',
      date: '2026-11-26',
      createdAt: 0,
      updatedAt: 0,
    }

    expect(transaction.amount).toBe(1234)
    expect(transfer.toAmount).toBe(73000)
  })
})
