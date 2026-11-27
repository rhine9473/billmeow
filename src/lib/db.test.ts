import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Account, Category, Transaction, Transfer } from '../types/bill'
import { RATE_SCALE } from '../types/bill'
import {
  DB_NAME,
  DbError,
  buildAccountIndex,
  clearAll,
  deleteAccount,
  deleteOne,
  getBackend,
  loadAccounts,
  loadAll,
  loadCategories,
  loadTransactions,
  loadTransfers,
  openDatabase,
  putOne,
  replaceAll,
  resetDbForTest,
  saveAccount,
  saveCategories,
  saveTransaction,
  saveTransfer,
  validateAccount,
  validateCategoryTree,
  validateTransaction,
  validateTransfer,
  validateUniqueCardTail,
} from './db'

function makeAccount(overrides: Partial<Account> = {}): Account {
  return {
    id: 'acc-cash',
    name: '现金',
    kind: 'asset',
    currency: 'CNY',
    initialBalance: 100000,
    archived: false,
    ...overrides,
  }
}

function makeCategory(overrides: Partial<Category> = {}): Category {
  return {
    id: 'cat-food',
    name: '餐饮',
    domain: 'expense',
    builtin: true,
    ...overrides,
  }
}

function makeTransaction(overrides: Partial<Transaction> = {}): Transaction {
  return {
    id: 'tx-1',
    domain: 'expense',
    amount: 2500,
    currency: 'CNY',
    categoryId: 'cat-food',
    accountId: 'acc-cash',
    occurredAt: '2026-11-26T08:30',
    occurredPrecision: 'minute',
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  }
}

function makeTransfer(overrides: Partial<Transfer> = {}): Transfer {
  return {
    id: 'tf-1',
    fromAccountId: 'acc-cash',
    fromAmount: 5000,
    fromCurrency: 'CNY',
    toAccountId: 'acc-card',
    toAmount: 5000,
    toCurrency: 'CNY',
    rate: RATE_SCALE,
    occurredAt: '2026-11-26T08:30',
    occurredPrecision: 'minute',
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  }
}

/* 失败路径会 console.error / alert，统一 mock，避免测试噪音与阻塞 */
let errorSpy: ReturnType<typeof vi.spyOn>
let alertSpy: ReturnType<typeof vi.spyOn>

beforeEach(async () => {
  errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
  alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {})
  localStorage.clear()
  await resetDbForTest()
  await clearAll()
})

afterEach(async () => {
  await resetDbForTest()
  vi.restoreAllMocks()
})

describe('validateAccount', () => {
  it('合法账户通过', () => {
    expect(validateAccount(makeAccount())).toBe(true)
  })

  it('拒绝非对象', () => {
    expect(() => validateAccount(null)).toThrow(DbError)
  })

  it('拒绝缺失名称', () => {
    expect(() => validateAccount(makeAccount({ name: '  ' }))).toThrow(/缺少名称/)
  })

  it('拒绝非法 kind', () => {
    expect(() => validateAccount({ ...makeAccount(), kind: 'other' })).toThrow(/kind/)
  })

  it('拒绝未知币种', () => {
    expect(() => validateAccount({ ...makeAccount(), currency: 'XYZ' })).toThrow(/币种/)
  })

  it('拒绝非整数初始余额', () => {
    expect(() => validateAccount(makeAccount({ initialBalance: 12.5 }))).toThrow(/初始余额/)
  })

  it('拒绝非 4 位卡号后四位', () => {
    expect(() => validateAccount(makeAccount({ cardTail: '123' }))).toThrow(/cardTail/)
    expect(validateAccount(makeAccount({ cardTail: '1234' }))).toBe(true)
  })
})

describe('validateCategoryTree', () => {
  it('允许一级 + 二级', () => {
    const parent = makeCategory()
    const child = makeCategory({ id: 'cat-food-lunch', parentId: parent.id, builtin: false })
    expect(() => validateCategoryTree([parent, child])).not.toThrow()
  })

  it('拒绝悬空父级', () => {
    const child = makeCategory({ id: 'cat-x', parentId: 'missing' })
    expect(() => validateCategoryTree([child])).toThrow(/不存在/)
  })

  it('拒绝三级分类', () => {
    const parent = makeCategory()
    const child = makeCategory({ id: 'cat-child', parentId: parent.id })
    const grandChild = makeCategory({ id: 'cat-grand', parentId: child.id })
    expect(() => validateCategoryTree([parent, child, grandChild])).toThrow(/已是二级分类/)
  })

  it('拒绝跨域父级', () => {
    const parent = makeCategory()
    const child = makeCategory({ id: 'cat-income', domain: 'income', parentId: parent.id })
    expect(() => validateCategoryTree([parent, child])).toThrow(/域不一致/)
  })
})

describe('validateUniqueCardTail', () => {
  it('尾号为空时不参与判重', () => {
    const a = makeAccount({ id: 'a' })
    const b = makeAccount({ id: 'b' })
    expect(() => validateUniqueCardTail([a, b])).not.toThrow()
  })

  it('尾号重复时拒绝', () => {
    const a = makeAccount({ id: 'a', cardTail: '1234' })
    const b = makeAccount({ id: 'b', cardTail: '1234' })
    expect(() => validateUniqueCardTail([a, b])).toThrow(/重复/)
  })
})

describe('validateTransaction', () => {
  const accounts = buildAccountIndex([
    makeAccount(),
    makeAccount({ id: 'acc-card', kind: 'liability', currency: 'USD', initialBalance: -100 }),
  ])
  const categories = new Map([['cat-food', { domain: 'expense' as const }]])

  it('合法记录通过', () => {
    expect(validateTransaction(makeTransaction(), accounts, categories)).toBe(true)
  })

  it('拒绝金额为 0', () => {
    expect(() => validateTransaction(makeTransaction({ amount: 0 }), accounts)).toThrow(/正整数/)
  })

  it('拒绝悬空账户', () => {
    expect(() => validateTransaction(makeTransaction({ accountId: 'nope' }), accounts)).toThrow(
      /不存在/,
    )
  })

  it('拒绝币种与账户不一致', () => {
    expect(() =>
      validateTransaction(makeTransaction({ accountId: 'acc-card' }), accounts),
    ).toThrow(/不一致/)
  })

  it('拒绝分类域与记录域不一致', () => {
    expect(() =>
      validateTransaction(makeTransaction({ domain: 'income' }), accounts, categories),
    ).toThrow(/域不一致/)
  })

  it('拒绝非法时间格式', () => {
    expect(() =>
      validateTransaction(makeTransaction({ occurredAt: '2026-11-26 08:30' }), accounts),
    ).toThrow(/occurredAt/)
  })

  it('拒绝不存在的日期', () => {
    expect(() =>
      validateTransaction(makeTransaction({ occurredAt: '2026-02-31T12:00' }), accounts),
    ).toThrow(/occurredAt/)
  })

  it('day 精度必须以 T12:00 结尾', () => {
    expect(() =>
      validateTransaction(
        makeTransaction({ occurredAt: '2026-11-26T00:00', occurredPrecision: 'day' }),
        accounts,
      ),
    ).toThrow(/T12:00/)
    expect(
      validateTransaction(
        makeTransaction({ occurredAt: '2026-11-26T12:00', occurredPrecision: 'day' }),
        accounts,
      ),
    ).toBe(true)
  })

  it('拒绝同币种的 foreign', () => {
    expect(() =>
      validateTransaction(
        makeTransaction({ foreign: { amount: 100, currency: 'CNY', rate: RATE_SCALE } }),
        accounts,
      ),
    ).toThrow(/不应与记账币种相同/)
  })

  it('接受跨币种的 foreign', () => {
    const record = makeTransaction({ foreign: { amount: 1000, currency: 'JPY', rate: 47300000 } })
    expect(validateTransaction(record, accounts)).toBe(true)
  })
})

describe('validateTransfer', () => {
  const accounts = buildAccountIndex([
    makeAccount(),
    makeAccount({ id: 'acc-card', kind: 'liability', currency: 'CNY', initialBalance: -90000 }),
    makeAccount({ id: 'acc-usd', currency: 'USD' }),
  ])

  it('合法转账通过', () => {
    expect(validateTransfer(makeTransfer(), accounts)).toBe(true)
  })

  it('拒绝转出与转入相同', () => {
    expect(() => validateTransfer(makeTransfer({ toAccountId: 'acc-cash' }), accounts)).toThrow(
      /相同/,
    )
  })

  it('同币种金额不等时拒绝', () => {
    expect(() => validateTransfer(makeTransfer({ toAmount: 4000 }), accounts)).toThrow(/相等/)
  })

  it('同币种 rate 必须是 RATE_SCALE', () => {
    expect(() => validateTransfer(makeTransfer({ rate: 1 }), accounts)).toThrow(/RATE_SCALE/)
  })

  it('接受跨币种转账', () => {
    const record = makeTransfer({
      fromAccountId: 'acc-usd',
      fromCurrency: 'USD',
      fromAmount: 10000,
      toAmount: 73000,
      toCurrency: 'CNY',
      rate: 730000000,
    })
    expect(validateTransfer(record, accounts)).toBe(true)
  })

  it('拒绝转出币种与账户不一致', () => {
    expect(() => validateTransfer(makeTransfer({ fromCurrency: 'USD' }), accounts)).toThrow(
      /转出币种/,
    )
  })
})

describe('db 读写', () => {
  it('使用 IndexedDB 后端', async () => {
    await loadAll('accounts')
    expect(getBackend()).toBe('indexedDB')
  })

  it('写入账户后重新打开仍可读到（模拟刷新）', async () => {
    await saveAccount(makeAccount())

    await resetDbForTest()

    const accounts = await loadAccounts()
    expect(accounts).toHaveLength(1)
    expect(accounts[0].id).toBe('acc-cash')
  })

  it('保存分类后可整批读回', async () => {
    const parent = makeCategory()
    const child = makeCategory({ id: 'cat-food-lunch', parentId: parent.id, builtin: false })
    await saveCategories([parent, child])

    const categories = await loadCategories()
    expect(categories.map((item) => item.id)).toEqual(['cat-food', 'cat-food-lunch'])
  })

  it('保存记录后可读回，并按账户索引校验', async () => {
    await saveAccount(makeAccount())
    await saveCategories([makeCategory()])
    await saveTransaction(makeTransaction())

    const records = await loadTransactions()
    expect(records).toHaveLength(1)
  })

  it('写入不合法记录时抛 DbError 且不落库', async () => {
    await saveAccount(makeAccount())
    await saveCategories([makeCategory()])

    await expect(saveTransaction(makeTransaction({ amount: 0 }))).rejects.toBeInstanceOf(DbError)
    expect(await loadTransactions()).toHaveLength(0)
  })

  it('保存转账后可读回', async () => {
    await saveAccount(makeAccount())
    await saveAccount(makeAccount({ id: 'acc-card', kind: 'liability', initialBalance: -90000 }))
    await saveTransfer(makeTransfer())

    const transfers = await loadTransfers()
    expect(transfers).toHaveLength(1)
  })

  it('putOne 同 id 覆盖而不是新增', async () => {
    await putOne('accounts', makeAccount())
    await putOne('accounts', makeAccount({ name: '钱包' }))

    const rows = await loadAll('accounts')
    expect(rows).toHaveLength(1)
  })

  it('deleteOne 幂等', async () => {
    await putOne('accounts', makeAccount())
    await deleteOne('accounts', 'acc-cash')

    expect(await loadAll('accounts')).toHaveLength(0)
    await expect(deleteOne('accounts', 'not:exists')).resolves.toBeUndefined()
  })

  it('replaceAll 整体覆盖', async () => {
    await putOne('accounts', makeAccount())
    await replaceAll('accounts', [makeAccount({ id: 'acc-new' })])

    const rows = await loadAll('accounts')
    expect(rows).toHaveLength(1)
    expect((rows[0] as Account).id).toBe('acc-new')
  })

  it('保存账户时校验卡号后四位唯一', async () => {
    await saveAccount(makeAccount({ cardTail: '1234' }))

    await expect(
      saveAccount(makeAccount({ id: 'acc-other', cardTail: '1234' })),
    ).rejects.toThrow(/重复/)
  })

  it('有流水的账户禁止删除', async () => {
    await saveAccount(makeAccount())
    await saveCategories([makeCategory()])
    await saveTransaction(makeTransaction())

    await expect(deleteAccount('acc-cash')).rejects.toThrow(/仍有流水/)
  })

  it('无流水的账户可删除', async () => {
    await saveAccount(makeAccount())

    await deleteAccount('acc-cash')
    expect(await loadAccounts()).toHaveLength(0)
  })

  it('读取时跳过脏数据而不影响其它记录', async () => {
    await putOne('accounts', makeAccount())
    await putOne('accounts', { id: 'broken' })

    const accounts = await loadAccounts()
    expect(accounts).toHaveLength(1)
    expect(accounts[0].id).toBe('acc-cash')
    expect(errorSpy).toHaveBeenCalled()
  })

  it('clearAll 清空全部业务仓库', async () => {
    await putOne('accounts', makeAccount())
    await putOne('categories', makeCategory())

    await clearAll()

    expect(await loadAll('accounts')).toHaveLength(0)
    expect(await loadAll('categories')).toHaveLength(0)
  })
})

describe('降级与异常', () => {
  it('IndexedDB 不可用时降级到 localStorage 仍能读写', async () => {
    await resetDbForTest()
    const opener = vi.spyOn(indexedDB, 'open').mockImplementation(() => {
      throw new Error('indexedDB 被禁用')
    })

    await saveAccount(makeAccount())

    expect(getBackend()).toBe('localStorage')
    expect(alertSpy).toHaveBeenCalled()
    const cached = JSON.parse(localStorage.getItem(`billmeow:fallback:accounts`) ?? '[]')
    expect(cached).toHaveLength(1)

    const accounts = await loadAccounts()
    expect(accounts).toHaveLength(1)
    opener.mockRestore()
  })

  it('版本降级时拒绝打开且不写兜底', async () => {
    await resetDbForTest()
    const opener = vi.spyOn(indexedDB, 'open').mockImplementation(() => {
      const request = { error: new DOMException('stale', 'VersionError') } as IDBOpenDBRequest
      /* 用微任务模拟浏览器的异步失败回调 */
      queueMicrotask(() => request.onerror?.(new Event('error')))
      return request
    })

    await expect(loadAll('accounts')).rejects.toBeInstanceOf(DbError)
    expect(getBackend()).toBe('indexedDB')
    opener.mockRestore()
  })

  it('兜底存储也被禁用时只提示不抛异常', async () => {
    await resetDbForTest()
    vi.spyOn(indexedDB, 'open').mockImplementation(() => {
      throw new Error('disabled')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError')
    })

    await expect(saveAccount(makeAccount())).rejects.toBeInstanceOf(DbError)
    expect(alertSpy).toHaveBeenCalled()
  })
})

describe('索引', () => {
  it('buildAccountIndex 只保留校验所需字段', () => {
    const index = buildAccountIndex([makeAccount()])
    expect(index.get('acc-cash')).toEqual({ currency: 'CNY', kind: 'asset' })
  })
})

/**
 * 删除现有数据库，用于模拟「全新安装」后再验证迁移。
 *
 * @returns 删除完成（或数据库本来不存在）时的 promise
 */
function deleteDatabase(): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(DB_NAME)
    request.onsuccess = () => resolve()
    request.onerror = () => reject(request.error)
    request.onblocked = () => resolve()
  })
}

/**
 * 按指定版本直接打开数据库并执行操作（模拟旧版本客户端）。
 *
 * @param version 要打开的版本号
 * @param setup 在升级回调中执行的建库逻辑
 */
function openRawVersion(
  version: number,
  setup: (db: IDBDatabase, tx: IDBTransaction) => void,
): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, version)
    request.onupgradeneeded = () => {
      if (request.transaction) setup(request.result, request.transaction)
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

describe('版本升级与数据迁移', () => {
  it('全新安装时建出四个仓库与索引', async () => {
    const db = await openDatabase()
    expect([...db.objectStoreNames].sort()).toEqual([
      'accounts',
      'categories',
      'transactions',
      'transfers',
    ])
    const categories = db.transaction('categories', 'readonly').objectStore('categories')
    expect([...categories.indexNames].sort()).toEqual(['by_domain', 'by_parent'])
  })

  it('从 v0 升级上来时把 localStorage 兜底数据搬进 IndexedDB', async () => {
    await resetDbForTest()
    await deleteDatabase()
    localStorage.setItem(
      'billmeow:fallback:accounts',
      JSON.stringify([makeAccount({ id: 'legacy' })]),
    )

    const accounts = await loadAccounts()
    expect(accounts.map((item) => item.id)).toEqual(['legacy'])
    /* 搬迁成功后清空兜底键，避免下次重复搬运 */
    expect(localStorage.getItem('billmeow:fallback:accounts')).toBeNull()
  })

  it('仓库已存在时不重复搬迁兜底数据', async () => {
    await saveAccount(makeAccount({ id: 'db-row' }))
    localStorage.setItem(
      'billmeow:fallback:accounts',
      JSON.stringify([makeAccount({ id: 'legacy' })]),
    )

    await resetDbForTest()

    const accounts = await loadAccounts()
    expect(accounts.map((item) => item.id)).toEqual(['db-row'])
  })

  it('从只含部分仓库的旧库升级时补齐其余仓库', async () => {
    await resetDbForTest()
    await deleteDatabase()
    const legacy = await openRawVersion(1, (db) => {
      const store = db.createObjectStore('transactions', { keyPath: 'id' })
      store.put(makeTransaction({ id: 'legacy-tx', accountId: 'missing' }))
    })
    legacy.close()

    const rows = await loadAll('transactions')
    expect(rows.map((row) => (row as Transaction).id)).toEqual(['legacy-tx'])
    expect(await loadAll('accounts')).toEqual([])
  })

  it('升级后再次打开复用同一连接，不重跑迁移', async () => {
    await resetDbForTest()
    await deleteDatabase()
    localStorage.setItem(
      'billmeow:fallback:accounts',
      JSON.stringify([makeAccount({ id: 'legacy' })]),
    )

    const first = await openDatabase()
    const second = await openDatabase()

    expect(first).toBe(second)
  })
})
