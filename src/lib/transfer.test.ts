import { describe, expect, it } from 'vitest'
import { resolveTransferKind } from './transfer'
import type { AccountKind } from '../types/bill'

describe('resolveTransferKind', () => {
  it('按两侧账户类型推导转账语义', () => {
    expect(resolveTransferKind('asset', 'asset')).toBe('internal')
    expect(resolveTransferKind('asset', 'liability')).toBe('repayment')
    expect(resolveTransferKind('liability', 'asset')).toBe('borrowing')
    expect(resolveTransferKind('liability', 'liability')).toBe('liabilityInternal')
  })

  it('覆盖全部四种组合，没有遗漏', () => {
    const kinds: AccountKind[] = ['asset', 'liability']
    const results = kinds.flatMap((from) => kinds.map((to) => resolveTransferKind(from, to)))

    expect(results).toHaveLength(4)
    expect(new Set(results).size).toBe(4)
  })

  it('负债账户之间的转移不归类为还款或借款', () => {
    /* 信用卡还信用卡属于负债互转，不能算作 repayment（那是资产→负债） */
    expect(resolveTransferKind('liability', 'liability')).toBe('liabilityInternal')
  })
})
