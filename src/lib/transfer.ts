import type { AccountKind, TransferKind } from '../types/bill'

/**
 * 转账业务类型的推导工具。
 *
 * 纯函数，仅做枚举映射，不涉及金额计算。
 */

/**
 * 判断转账的默认业务类型（未显式指定 `kind` 时使用）。
 *
 * @param fromKind 转出账户类型
 * @param toKind 转入账户类型
 * @returns 由两个账户类型推导出的转账类型
 * @example
 * resolveTransferKind('asset', 'liability')      // 'repayment'
 * resolveTransferKind('liability', 'liability')  // 'liabilityInternal'
 */
export function resolveTransferKind(fromKind: AccountKind, toKind: AccountKind): TransferKind {
  if (fromKind === 'asset' && toKind === 'asset') return 'internal'
  if (fromKind === 'asset' && toKind === 'liability') return 'repayment'
  if (fromKind === 'liability' && toKind === 'asset') return 'borrowing'
  return 'liabilityInternal'
}
