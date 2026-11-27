import { describe, expect, it } from 'vitest'
import { getCurrencyDecimals } from '../lib/currency'
import {
  CURRENCY_MAP,
  RATE_SCALE,
  type Account,
  type Category,
  type CurrencyCode,
  type DuplicateMatchLevel,
  type ForeignExchange,
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

/* 查表与校验函数的测试见 src/lib/currency.test.ts、src/lib/transfer.test.ts */

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
      occurredAt: '2026-11-26T08:30',
      occurredPrecision: 'minute',
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
      rate: Math.round(7.3 * RATE_SCALE),
      occurredAt: '2026-11-26T12:00',
      occurredPrecision: 'day',
      createdAt: 0,
      updatedAt: 0,
    }

    expect(transaction.amount).toBe(1234)
    expect(transfer.toAmount).toBe(73000)
  })
})

describe('时间精度约定', () => {
  /* 分钟精度格式：YYYY-MM-DDTHH:mm，不含秒、不含毫秒、不带时区后缀 */
  const MINUTE_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/

  it('合法时间串符合分钟精度格式', () => {
    expect('2026-11-26T08:30').toMatch(MINUTE_PATTERN)
    /* 补齐值：只知日期时统一补当天正午 */
    expect('2026-11-26T12:00').toMatch(MINUTE_PATTERN)
  })

  it('带秒、带毫秒、带时区后缀的时间串不符合约定', () => {
    expect('2026-11-26T08:30:00').not.toMatch(MINUTE_PATTERN)
    expect('2026-11-26T08:30:00.123').not.toMatch(MINUTE_PATTERN)
    expect('2026-11-26T08:30Z').not.toMatch(MINUTE_PATTERN)
    expect('2026-11-26').not.toMatch(MINUTE_PATTERN)
  })

  it('补齐值固定用正午，避免时区偏移跨天', () => {
    /*
     * 补 00:00 时，UTC+8 以西的时区偏移会让它退到前一天；
     * 12:00 向前后各留 12 小时余量，任何常见时区偏移都不会跨天。
     */
    const filledForDayPrecision = '2026-11-26T12:00'
    expect(filledForDayPrecision.endsWith('T12:00')).toBe(true)
  })

  it('相似度只有 exact 与 similar 两档', () => {
    const levels: DuplicateMatchLevel[] = ['exact', 'similar']
    expect(levels).toHaveLength(2)
    /* 两档都只用于 UI 标记，不代表自动删除 */
    expect(levels).toEqual(['exact', 'similar'])
  })
})

describe('金额前的符号约定', () => {
  it('Transaction.amount 恒为正，方向由 domain 决定', () => {
    /* 支出不写负数；方向信息已经由 domain 承载，金额再加符号会导致双重表达 */
    const expense: Transaction = {
      id: 'tx-1',
      domain: 'expense',
      amount: 1234,
      currency: 'CNY',
      categoryId: 'cat-1',
      accountId: 'acc-1',
      occurredAt: '2026-11-26T12:00',
      occurredPrecision: 'day',
      createdAt: 0,
      updatedAt: 0,
    }
    expect(expense.amount).toBeGreaterThan(0)
    expect(expense.domain).toBe('expense')
  })

  it('Transfer 两侧金额恒为正，跨币种时数值可以不同', () => {
    const exchange: Transfer = {
      id: 'tr-1',
      fromAccountId: 'acc-usd',
      fromAmount: 10000,
      fromCurrency: 'USD',
      toAccountId: 'acc-cny',
      toAmount: 73000,
      toCurrency: 'CNY',
      rate: Math.round(7.3 * RATE_SCALE),
      occurredAt: '2026-11-26T12:00',
      occurredPrecision: 'day',
      createdAt: 0,
      updatedAt: 0,
    }
    expect(exchange.fromAmount).toBeGreaterThan(0)
    expect(exchange.toAmount).toBeGreaterThan(0)
    expect(exchange.fromAmount).not.toBe(exchange.toAmount)
  })

  it('Account.initialBalance 可正可负，负债账户为负', () => {
    const cash: Account = {
      id: 'acc-1',
      name: '现金',
      kind: 'asset',
      currency: 'CNY',
      initialBalance: 100000,
      archived: false,
    }
    const creditCard: Account = {
      id: 'acc-2',
      name: '信用卡',
      kind: 'liability',
      currency: 'CNY',
      initialBalance: -120000,
      archived: false,
    }
    expect(cash.initialBalance).toBeGreaterThan(0)
    expect(creditCard.initialBalance).toBeLessThan(0)
  })
})

describe('跨币种转账反推汇率', () => {
  it('两侧 decimals 相同时可直接相除', () => {
    /* 100.00 USD → 730.00 CNY，均为 2 位小数 */
    const fromMajor = 10000 / 10 ** 2
    const toMajor = 73000 / 10 ** 2
    expect(toMajor / fromMajor).toBeCloseTo(7.3, 10)
  })

  it('两侧 decimals 不同时必须先各自折成元再相除', () => {
    /* 10000 JPY（decimals = 0）→ 500.00 CNY（decimals = 2） */
    const fromMinor = 10000
    const toMinor = 50000
    const fromDecimals = getCurrencyDecimals('JPY')
    const toDecimals = getCurrencyDecimals('CNY')

    /* 错误做法：直接相除，会把 JPY 的 0 位当 2 位，结果差 100 倍 */
    const wrong = toMinor / fromMinor
    expect(wrong).toBe(5)

    /* 正确做法：各自按自己的 decimals 折成元 */
    const correct = toMinor / 10 ** toDecimals / (fromMinor / 10 ** fromDecimals)
    expect(correct).toBeCloseTo(0.05, 10)
  })

  it('分母为 0 时返回 null 而不是 Infinity', () => {
    const rate = (fromMinor: number, fromDec: number, toMinor: number, toDec: number) => {
      const fromMajor = fromMinor / 10 ** fromDec
      return fromMajor > 0 ? toMinor / 10 ** toDec / fromMajor : null
    }
    expect(rate(0, 2, 73000, 2)).toBeNull()
    expect(rate(10000, 2, 73000, 2)).toBeCloseTo(7.3, 10)
  })
})

describe('默认账户策略', () => {
  it('单账户时记账无需选择，accountId 仍必填', () => {
    const onlyAccount: Account = {
      id: 'acc-default',
      name: '默认账户',
      kind: 'asset',
      currency: 'CNY',
      initialBalance: 0,
      archived: false,
    }

    /* 用户无感知，但数据层仍完整记录归属 */
    const tx: Transaction = {
      id: 'tx-1',
      domain: 'expense',
      amount: 500,
      currency: onlyAccount.currency,
      categoryId: 'cat-1',
      accountId: onlyAccount.id,
      occurredAt: '2026-11-26T12:00',
      occurredPrecision: 'day',
      createdAt: 0,
      updatedAt: 0,
    }

    expect(tx.accountId).toBe(onlyAccount.id)
    expect(tx.currency).toBe(onlyAccount.currency)
  })
})

describe('汇率精度与语义', () => {
  it('RATE_SCALE 为 10^8，未使用金额那套 10^decimals', () => {
    expect(RATE_SCALE).toBe(100_000_000)
    expect(RATE_SCALE).not.toBe(10 ** 2)
  })

  it('16 位以内的汇率值仍是安全整数', () => {
    /* 真实汇率区间 0.00000001 ~ 1000，乘以 10^8 后远低于 MAX_SAFE_INTEGER */
    const maxRealisticRate = 1000 * RATE_SCALE
    expect(Number.isSafeInteger(maxRealisticRate)).toBe(true)
    expect(maxRealisticRate).toBeLessThan(Number.MAX_SAFE_INTEGER)
  })

  it('JPY → CNY 这类小于 1 的汇率用 8 位才不会丢精度', () => {
    /* 0.047523 用 2 位小数会变成 0.05，误差超过 5% */
    const truncated2 = Math.round(0.047523 * 10 ** 2) / 10 ** 2
    const precise8 = Math.round(0.047523 * RATE_SCALE)
    expect(truncated2).toBe(0.05)
    expect(precise8).toBe(4752300)
    /* 8 位还原后与原始值一致 */
    expect(precise8 / RATE_SCALE).toBe(0.047523)
  })

  it('8 位精度下大额兑换的误差低于「分」', () => {
    /* 换 100 万 JPY，8 位截断误差 0.5e-8 带来的金额偏差 */
    const amount = 1_000_000
    const truncationError = 0.5 / RATE_SCALE
    expect(amount * truncationError).toBeLessThan(0.01)
  })

  it('跨币种转账可用 rate 重算金额，差额即用户手改的部分', () => {
    const fromAmount = 10000 /* 100.00 USD */
    const fromDecimals = getCurrencyDecimals('USD')
    const toDecimals = getCurrencyDecimals('CNY')
    const rate = 730000000 /* 7.3 × RATE_SCALE */

    /* 按汇率应得的金额（整数最小单位） */
    const expected = Math.round((fromAmount / 10 ** fromDecimals) * (rate / RATE_SCALE) * 10 ** toDecimals)
    expect(expected).toBe(73000)

    /* 用户按银行实际成交价手改成了 72950，差额 50 分 */
    const archived = 72950
    expect(archived - expected).toBe(-50)
  })

  it('同币种转账的 rate 填 RATE_SCALE（1.0），不留空', () => {
    const sameCurrency: Transfer = {
      id: 'tr-1',
      fromAccountId: 'acc-1',
      fromAmount: 50000,
      fromCurrency: 'CNY',
      toAccountId: 'acc-2',
      toAmount: 50000,
      toCurrency: 'CNY',
      rate: RATE_SCALE,
      occurredAt: '2026-11-26T12:00',
      occurredPrecision: 'day',
      createdAt: 0,
      updatedAt: 0,
    }
    /* 字段恒有值，调用方无需处理「无汇率」分支 */
    expect(sameCurrency.rate).toBe(RATE_SCALE)
    expect(sameCurrency.rate / RATE_SCALE).toBe(1)
    expect(sameCurrency.fromAmount).toBe(sameCurrency.toAmount)
  })
})

describe('对外跨币种交易（Transaction.foreign）', () => {
  it('同币种交易不必填 foreign', () => {
    const domestic: Transaction = {
      id: 'tx-cny',
      domain: 'expense',
      amount: 3000,
      currency: 'CNY',
      categoryId: 'cat-1',
      accountId: 'acc-cny',
      occurredAt: '2026-11-26T12:00',
      occurredPrecision: 'day',
      createdAt: 0,
      updatedAt: 0,
    }
    expect(domestic.foreign).toBeUndefined()
  })

  it('CNY 账户支付 1000 JPY 订单时，记账金额与原始交易金额并存', () => {
    const foreign: ForeignExchange = {
      amount: 1000, /* 原始交易：1000 JPY（decimals = 0） */
      currency: 'JPY',
      rate: 6850000, /* 1 JPY = 0.0685 CNY */
    }

    const tx: Transaction = {
      id: 'tx-jpy-order',
      domain: 'expense',
      amount: 6850, /* 账户实际扣款：68.50 CNY */
      currency: 'CNY',
      categoryId: 'cat-1',
      accountId: 'acc-cny',
      occurredAt: '2026-11-26T12:00',
      occurredPrecision: 'day',
      foreign,
      createdAt: 0,
      updatedAt: 0,
    }

    /* 记账金额归账户币种，用于余额与统计 */
    expect(tx.currency).toBe('CNY')
    expect(tx.amount).toBe(6850)

    /* 原始交易信息独立保存，用于显示「1000 JPY ≈ 68.50 CNY」 */
    expect(tx.foreign?.currency).toBe('JPY')
    expect(tx.foreign?.amount).toBe(1000)

    /* 用 foreign.rate 重算，应与记账金额一致（此处无手改） */
    const derived = Math.round(
      (foreign.amount / 10 ** getCurrencyDecimals(foreign.currency)) *
        (foreign.rate / RATE_SCALE) *
        10 ** getCurrencyDecimals(tx.currency),
    )
    expect(derived).toBe(tx.amount)
  })

  it('用户按银行实际扣款手改金额后，差额可被算出', () => {
    const foreign: ForeignExchange = { amount: 1000, currency: 'JPY', rate: 6850000 }
    const derivedAmount = Math.round(
      (foreign.amount / 10 ** 0) * (foreign.rate / RATE_SCALE) * 10 ** 2,
    ) /* 6850 分 = 68.50 CNY */

    /* 银行实收 68.80，用户手改 */
    const actualAmount = 6880
    expect(actualAmount - derivedAmount).toBe(30)
  })

  it('foreign 的三项必须齐全，不能只填一半', () => {
    /* 类型层面已强制：ForeignExchange 全字段必填，缺一项即编译失败 */
    const incomplete = {
      amount: 1000,
      currency: 'JPY',
      rate: 6850000,
    } satisfies ForeignExchange
    expect(Object.keys(incomplete)).toEqual(['amount', 'currency', 'rate'])
  })

  it('foreign.rate 与 Transfer.rate 共用同一精度', () => {
    /* 同为 × RATE_SCALE，7.3 的存法一致 */
    const transferRate = Math.round(7.3 * RATE_SCALE)
    const foreignRate = Math.round(7.3 * RATE_SCALE)
    expect(transferRate).toBe(foreignRate)
    expect(transferRate).toBe(730000000)
  })
})
