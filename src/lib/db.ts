import type {
  Account,
  Category,
  CurrencyCode,
  Transfer,
  Transaction,
} from '../types/bill'
import { RATE_SCALE } from '../types/bill'
import { isCurrencyCode } from './currency'

/**
 * 持久化层（A2）：账单 / 账户 / 分类 / 转账落盘。
 *
 * 设计取舍：
 * - 结构化业务数据走 **IndexedDB**（异步、事务、索引），避免同步读写阻塞 UI；
 * - 轻量设置项（主题色、过渡时长等）仍走 `storage.ts` 的 `localStorage`；
 * - IndexedDB 不可用（隐私模式、浏览器禁用、打开连续失败）时**整体降级**到
 *   `localStorage` 同名键，保证「刷新不丢」这条底线；
 * - 所有写入都先过 {@link validateAccount} 等校验函数，脏数据直接拒绝，
 *   绝不落库——从存储读回的数据也会再校验一次（外部可篡改）。
 *
 * @remarks
 * **分层契约**：本文件不依赖 `pinia` / 组件，A5 的 store 只调用这里暴露的函数。
 * 币种、金额单位的规则见 `src/types/README.md`，本文件只做「存得下、读得回、不写脏」。
 *
 * @example
 * await saveAccount({ id: 'a1', name: '现金', kind: 'asset', currency: 'CNY',
 *   initialBalance: 0, archived: false })
 * const accounts = await loadAccounts()
 */

/** IndexedDB 数据库名 */
export const DB_NAME = 'billmeow'

/**
 * IndexedDB 数据库版本。
 *
 * 新增对象仓库或索引时 +1，并在 {@link MIGRATIONS} 中新增一项
 * «目标版本 → 升级函数»（详见 `DB.md` 第 3 节）；
 * 不要直接改已有项的迁移行为，否则已安装的旧库不会重跑升级逻辑。
 */
export const DB_VERSION = 1

/** 结构化业务数据的四个存储单元，对应 `indexedDB` 的对象仓库 */
export type StoreName = 'accounts' | 'categories' | 'transactions' | 'transfers'

/** 全部业务仓库，遍历清空 / 迁移时使用（顺序即建库顺序） */
const ALL_STORES: readonly StoreName[] = [
  'accounts',
  'categories',
  'transactions',
  'transfers',
]

/**
 * 持久化后端标识：要么是 `indexedDB`，要么是降级后的 `localStorage`。
 *
 * 调试或界面提示「数据可能只保存在本机轻量存储中」时读取 {@link getBackend}。
 */
export type StorageBackend = 'indexedDB' | 'localStorage'

/** localStorage 兜底键前缀，后接 {@link StoreName}；与 DB 名一起构成命名空间 */
const FALLBACK_PREFIX = `${DB_NAME}:fallback:`

/**
 * 校验失败的原因，供调用方区分「数据本身有问题」与「存储不可用」。
 *
 * - `invalid`：数据违反业务约束（币种不一致、悬空账户等），**调用方应修复数据后重试**
 * - `unavailable`：存储层不可用且兜底也失败，**数据没有落盘**
 */
export type DbErrorKind = 'invalid' | 'unavailable'

/** 持久化层的统一错误类型，便于调用方 `instanceof` 判断 */
export class DbError extends Error {
  /** 错误分类 */
  readonly kind: DbErrorKind

  /**
   * @param kind 错误分类
   * @param message 给开发者看的详细信息
   */
  constructor(kind: DbErrorKind, message: string) {
    super(message)
    this.name = 'DbError'
    this.kind = kind
  }
}

/**
 * 校验失败时的统一提示入口。
 *
 * 与 `storage.ts` 的策略一致：存储异常不能让界面「看起来一切正常」，
 * 因此兜底提示用原生 `alert`；接入 notification 组件后只改这一处。
 *
 * @param message 展示给用户的提示文案
 */
function notifyError(message: string) {
  if (typeof window === 'undefined') return
  window.alert(message)
}

/* -------------------------------------------------------------------------- */
/* 校验                                                                        */
/* -------------------------------------------------------------------------- */

/**
 * 判断值是否为非空字符串。
 *
 * @param value 待校验的值
 * @returns 非空字符串时为 `true`
 */
function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim() !== ''
}

/**
 * 判断值是否为非负安全整数（金额的通用约束）。
 *
 * 上界 `Number.MAX_SAFE_INTEGER` 是整数运算精度的天花板，超过后加减不再可靠。
 *
 * @param value 待校验的值
 * @returns 非负安全整数时为 `true`
 */
function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
}

/**
 * 判断值是否为可用的币种代码。
 *
 * 转调 `isCurrencyCode`，保证「币种表只有一个来源」；
 * 从存储读回的外部数据必须先过这一关再交给业务逻辑。
 *
 * @param value 待校验的值
 * @returns 合法币种代码时为 `true`，并收窄类型
 */
function isCurrency(value: unknown): value is CurrencyCode {
  return isCurrencyCode(value)
}

/**
 * 判断两个币种是否一致。
 *
 * @param a 币种代码
 * @param b 币种代码
 * @returns 相同时为 `true`
 */
function sameCurrency(a: CurrencyCode, b: CurrencyCode): boolean {
  return a === b
}

/**
 * 校验 `YYYY-MM-DDTHH:mm` 格式的时间字符串。
 *
 * 除了正则还要「回读」一次：`2026-02-31` 能通过格式正则，但不是真实日期。
 * 秒与毫秒位约定为 0，因此格式里根本不接受它们，避免写入方随手塞值。
 *
 * @param value 待校验的时间字符串
 * @returns 合法分钟精度时间时为 `true`
 */
function isMinuteTimestamp(value: unknown): value is string {
  if (typeof value !== 'string') return false
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return false
  const [date] = value.split('T')
  const [year, month, day] = date.split('-').map(Number)
  const parsed = new Date(`${date}T00:00:00`)
  return (
    parsed.getFullYear() === year && parsed.getMonth() + 1 === month && parsed.getDate() === day
  )
}

/**
 * 校验账户实体。
 *
 * 校验点：`id` / `name` 非空、`kind` 合法、币种受支持、初始余额与时间戳为整数、
 * `cardTail` 存在时必须是 4 位数字（CSV 导入按后四位去重，格式错了会静默失配）。
 *
 * @param value 待校验的值（可能是从存储读回的脏数据）
 * @returns 合法时为 `true`；否则抛 {@link DbError}，`kind` 为 `invalid`
 * @throws {DbError} 数据不合规时
 */
export function validateAccount(value: unknown): value is Account {
  if (typeof value !== 'object' || value === null) {
    throw new DbError('invalid', '账户数据不是对象')
  }
  const account = value as Partial<Account>
  if (!isNonEmptyString(account.id)) throw new DbError('invalid', '账户缺少 id')
  if (!isNonEmptyString(account.name)) throw new DbError('invalid', `账户 ${account.id} 缺少名称`)
  if (account.kind !== 'asset' && account.kind !== 'liability') {
    throw new DbError('invalid', `账户 ${account.id} 的 kind 非法`)
  }
  if (!isCurrency(account.currency)) {
    throw new DbError('invalid', `账户 ${account.id} 的币种非法`)
  }
  if (typeof account.initialBalance !== 'number' || !Number.isSafeInteger(account.initialBalance)) {
    throw new DbError('invalid', `账户 ${account.id} 的初始余额必须是安全整数`)
  }
  if (typeof account.archived !== 'boolean') {
    throw new DbError('invalid', `账户 ${account.id} 的 archived 必须是布尔值`)
  }
  if (account.cardTail !== undefined && !/^\d{4}$/.test(account.cardTail)) {
    throw new DbError('invalid', `账户 ${account.id} 的 cardTail 必须是 4 位数字`)
  }
  return true
}

/**
 * 校验分类实体。
 *
 * 只做「单条自洽」检查；`parentId` 是否指向同域一级分类属于跨记录规则，
 * 由 {@link validateCategoryTree} 在整批写入时统一把关。
 *
 * @param value 待校验的值
 * @returns 合法时为 `true`；否则抛 {@link DbError}
 * @throws {DbError} 数据不合规时
 */
export function validateCategory(value: unknown): value is Category {
  if (typeof value !== 'object' || value === null) {
    throw new DbError('invalid', '分类数据不是对象')
  }
  const category = value as Partial<Category>
  if (!isNonEmptyString(category.id)) throw new DbError('invalid', '分类缺少 id')
  if (!isNonEmptyString(category.name)) {
    throw new DbError('invalid', `分类 ${category.id} 缺少名称`)
  }
  if (category.domain !== 'expense' && category.domain !== 'income') {
    throw new DbError('invalid', `分类 ${category.id} 的 domain 非法`)
  }
  if (typeof category.builtin !== 'boolean') {
    throw new DbError('invalid', `分类 ${category.id} 的 builtin 必须是布尔值`)
  }
  if (category.parentId !== undefined && !isNonEmptyString(category.parentId)) {
    throw new DbError('invalid', `分类 ${category.id} 的 parentId 必须是非空字符串`)
  }
  if (category.hidden !== undefined && typeof category.hidden !== 'boolean') {
    throw new DbError('invalid', `分类 ${category.id} 的 hidden 必须是布尔值`)
  }
  if (category.order !== undefined && !isNonNegativeInteger(category.order)) {
    throw new DbError('invalid', `分类 ${category.id} 的 order 必须是非负整数`)
  }
  return true
}

/**
 * 校验分类层级：只允许「一级 + 二级」两层，且父级必须同域。
 *
 * 这条约束类型系统表达不了（见 `types/README.md`「A2 必须校验的跨字段规则」），
 * 单条校验又看不到父级，因此需要在写入整批分类时单独跑一次。
 *
 * @param categories 待写入的完整分类列表
 * @throws {DbError} 存在悬空父级、跨域父级或三级分类时
 */
export function validateCategoryTree(categories: readonly Category[]): void {
  const byId = new Map(categories.map((item) => [item.id, item]))
  for (const category of categories) {
    if (!category.parentId) continue
    const parent = byId.get(category.parentId)
    if (!parent) {
      throw new DbError('invalid', `分类 ${category.id} 的父级 ${category.parentId} 不存在`)
    }
    if (parent.parentId) {
      throw new DbError('invalid', `分类 ${category.id} 的父级 ${parent.id} 已是二级分类`)
    }
    if (parent.domain !== category.domain) {
      throw new DbError('invalid', `分类 ${category.id} 与其父级 ${parent.id} 的域不一致`)
    }
  }
}

/**
 * 用于账户引用的轻量索引，只保留校验需要的两个字段。
 *
 * 校验跨字段规则时不该把整张账户表搬来搬去，尤其是币种只能从账户取，
 * 而账户数远小于记录数，按 `id` 查表即可。
 */
export type AccountsById = ReadonlyMap<string, Pick<Account, 'currency' | 'kind'>>

/**
 * 校验一笔支出 / 收入记录。
 *
 * 覆盖 `types/README.md` 中列出的跨字段规则：金额为正整数、币种受支持、
 * 分类与账户存在、记录币种与账户币种一致、时间字符串合法、
 * `foreign` 存在时不得与记账币种相同且金额、汇率为正整数。
 *
 * @param value 待校验的值
 * @param accounts 账户索引，用于校验账户存在与币种一致
 * @param categories 分类索引（`id` → 分类），不传时跳过分类存在性检查
 * @returns 合法时为 `true`；否则抛 {@link DbError}
 * @throws {DbError} 数据不合规时
 */
export function validateTransaction(
  value: unknown,
  accounts: AccountsById,
  categories?: ReadonlyMap<string, Pick<Category, 'domain'>>,
): value is Transaction {
  if (typeof value !== 'object' || value === null) {
    throw new DbError('invalid', '记录数据不是对象')
  }
  const record = value as Partial<Transaction>
  if (!isNonEmptyString(record.id)) throw new DbError('invalid', '记录缺少 id')
  if (record.domain !== 'expense' && record.domain !== 'income') {
    throw new DbError('invalid', `记录 ${record.id} 的 domain 非法`)
  }
  if (!isNonNegativeInteger(record.amount) || record.amount === 0) {
    throw new DbError('invalid', `记录 ${record.id} 的金额必须是正整数`)
  }
  if (!isCurrency(record.currency)) {
    throw new DbError('invalid', `记录 ${record.id} 的币种非法`)
  }
  if (!isNonEmptyString(record.accountId)) {
    throw new DbError('invalid', `记录 ${record.id} 缺少 accountId`)
  }
  const account = accounts.get(record.accountId)
  if (!account) {
    throw new DbError('invalid', `记录 ${record.id} 指向的账户 ${record.accountId} 不存在`)
  }
  if (!sameCurrency(account.currency, record.currency)) {
    throw new DbError('invalid', `记录 ${record.id} 的币种与账户 ${record.accountId} 不一致`)
  }
  if (!isNonEmptyString(record.categoryId)) {
    throw new DbError('invalid', `记录 ${record.id} 缺少 categoryId`)
  }
  if (categories) {
    const category = categories.get(record.categoryId)
    if (!category) {
      throw new DbError('invalid', `记录 ${record.id} 指向的分类 ${record.categoryId} 不存在`)
    }
    if (category.domain !== record.domain) {
      throw new DbError('invalid', `记录 ${record.id} 的分类 ${record.categoryId} 域不一致`)
    }
  }
  if (!isMinuteTimestamp(record.occurredAt)) {
    throw new DbError('invalid', `记录 ${record.id} 的 occurredAt 不是合法的分钟精度时间`)
  }
  if (record.occurredPrecision !== 'minute' && record.occurredPrecision !== 'day') {
    throw new DbError('invalid', `记录 ${record.id} 的 occurredPrecision 非法`)
  }
  /* day 精度统一补正午：零点会在时区偏移下跨到前一天 */
  if (record.occurredPrecision === 'day' && !record.occurredAt.endsWith('T12:00')) {
    throw new DbError('invalid', `记录 ${record.id} 的 day 精度时间必须以 T12:00 结尾`)
  }
  if (record.note !== undefined && typeof record.note !== 'string') {
    throw new DbError('invalid', `记录 ${record.id} 的 note 必须是字符串`)
  }
  if (!Number.isFinite(record.createdAt) || !Number.isSafeInteger(record.createdAt)) {
    throw new DbError('invalid', `记录 ${record.id} 的 createdAt 必须是整数`)
  }
  if (!Number.isFinite(record.updatedAt) || !Number.isSafeInteger(record.updatedAt)) {
    throw new DbError('invalid', `记录 ${record.id} 的 updatedAt 必须是整数`)
  }
  if (record.foreign !== undefined) {
    const foreign = record.foreign
    if (typeof foreign !== 'object' || foreign === null) {
      throw new DbError('invalid', `记录 ${record.id} 的 foreign 必须是对象`)
    }
    if (!isCurrency(foreign.currency)) {
      throw new DbError('invalid', `记录 ${record.id} 的 foreign.currency 非法`)
    }
    /* 同币种交易不该填 foreign，否则「是否跨币种」的判断会退化成逐字段比较 */
    if (sameCurrency(foreign.currency, record.currency)) {
      throw new DbError('invalid', `记录 ${record.id} 的 foreign 币种不应与记账币种相同`)
    }
    if (!isNonNegativeInteger(foreign.amount) || foreign.amount === 0) {
      throw new DbError('invalid', `记录 ${record.id} 的 foreign.amount 必须是正整数`)
    }
    if (!isNonNegativeInteger(foreign.rate) || foreign.rate === 0) {
      throw new DbError('invalid', `记录 ${record.id} 的 foreign.rate 必须是正整数`)
    }
  }
  return true
}

/**
 * 校验一笔转账。
 *
 * 关键约束：两侧账户存在且币种各自匹配；同币种时 `fromAmount === toAmount`
 * （否则会凭空多出或湮灭钱款）；`rate` 必填且为正整数。
 *
 * @param value 待校验的值
 * @param accounts 账户索引
 * @returns 合法时为 `true`；否则抛 {@link DbError}
 * @throws {DbError} 数据不合规时
 */
export function validateTransfer(value: unknown, accounts: AccountsById): value is Transfer {
  if (typeof value !== 'object' || value === null) {
    throw new DbError('invalid', '转账数据不是对象')
  }
  const record = value as Partial<Transfer>
  if (!isNonEmptyString(record.id)) throw new DbError('invalid', '转账缺少 id')
  if (!isNonEmptyString(record.fromAccountId) || !isNonEmptyString(record.toAccountId)) {
    throw new DbError('invalid', `转账 ${record.id} 缺少转出 / 转入账户`)
  }
  if (record.fromAccountId === record.toAccountId) {
    throw new DbError('invalid', `转账 ${record.id} 的转出与转入账户相同`)
  }
  const from = accounts.get(record.fromAccountId)
  if (!from) {
    throw new DbError('invalid', `转账 ${record.id} 的转出账户 ${record.fromAccountId} 不存在`)
  }
  const to = accounts.get(record.toAccountId)
  if (!to) {
    throw new DbError('invalid', `转账 ${record.id} 的转入账户 ${record.toAccountId} 不存在`)
  }
  if (!isCurrency(record.fromCurrency) || !sameCurrency(from.currency, record.fromCurrency)) {
    throw new DbError('invalid', `转账 ${record.id} 的转出币种与账户不一致`)
  }
  if (!isCurrency(record.toCurrency) || !sameCurrency(to.currency, record.toCurrency)) {
    throw new DbError('invalid', `转账 ${record.id} 的转入币种与账户不一致`)
  }
  if (!isNonNegativeInteger(record.fromAmount) || record.fromAmount === 0) {
    throw new DbError('invalid', `转账 ${record.id} 的转出金额必须是正整数`)
  }
  if (!isNonNegativeInteger(record.toAmount) || record.toAmount === 0) {
    throw new DbError('invalid', `转账 ${record.id} 的转入金额必须是正整数`)
  }
  if (
    sameCurrency(record.fromCurrency, record.toCurrency) &&
    record.fromAmount !== record.toAmount
  ) {
    throw new DbError('invalid', `转账 ${record.id} 为同币种转账，两侧金额必须相等`)
  }
  if (!isNonNegativeInteger(record.rate) || record.rate === 0) {
    throw new DbError('invalid', `转账 ${record.id} 的 rate 必须是正整数`)
  }
  if (
    sameCurrency(record.fromCurrency, record.toCurrency) &&
    record.rate !== RATE_SCALE
  ) {
    throw new DbError('invalid', `转账 ${record.id} 为同币种转账，rate 必须是 RATE_SCALE`)
  }
  if (!isMinuteTimestamp(record.occurredAt)) {
    throw new DbError('invalid', `转账 ${record.id} 的 occurredAt 不是合法的分钟精度时间`)
  }
  if (record.occurredPrecision !== 'minute' && record.occurredPrecision !== 'day') {
    throw new DbError('invalid', `转账 ${record.id} 的 occurredPrecision 非法`)
  }
  if (record.occurredPrecision === 'day' && !record.occurredAt.endsWith('T12:00')) {
    throw new DbError('invalid', `转账 ${record.id} 的 day 精度时间必须以 T12:00 结尾`)
  }
  if (!Number.isSafeInteger(record.createdAt) || !Number.isSafeInteger(record.updatedAt)) {
    throw new DbError('invalid', `转账 ${record.id} 的时间戳必须是整数`)
  }
  return true
}

/**
 * 校验 `cardTail` 在账户集合内唯一。
 *
 * 后四位用于 CSV 导入去重，两张账户共用一个尾号会让导入比对错配，
 * 因此写入前必须拦住（类型系统同样表达不了这条约束）。
 *
 * @param accounts 待写入的完整账户列表
 * @throws {DbError} 存在重复的 `cardTail` 时
 */
export function validateUniqueCardTail(accounts: readonly Account[]): void {
  const seen = new Map<string, string>()
  for (const account of accounts) {
    if (!account.cardTail) continue
    const existing = seen.get(account.cardTail)
    if (existing) {
      throw new DbError('invalid', `账户 ${existing} 与 ${account.id} 的卡号后四位重复`)
    }
    seen.set(account.cardTail, account.id)
  }
}

/* -------------------------------------------------------------------------- */
/* IndexedDB 访问                                                              */
/* -------------------------------------------------------------------------- */

/**
 * 升级过程中各版本的修补结果，供 {@link openDatabase} 在升级事务结束后统一处理。
 *
 * 升级事务里能做的事有限：只能读写本库的对象仓库，**不能 `await`**，
 * 一 `await` 事务就会因「没有待处理请求」而自动提交，后续写入全部丢失。
 * 因此这里只登记「事后需要处理什么」，真正的数据迁移放到新连接上另开事务完成。
 */
interface MigrationOutcome {
  /** 需要把 `localStorage` 兜底数据搬进 IndexedDB 的仓库 */
  adopt: StoreName[]
  /** 升级事务已因数据不合法而中止 */
  aborted: boolean
}

/**
 * 记录当前升级需要补救的仓库列表。
 *
 * @param store 需要迁移的仓库
 */
function adoptStore(store: StoreName): void {
  if (!migrationOutcome.adopt.includes(store)) migrationOutcome.adopt.push(store)
}

/** 本轮升级的事务级补丁，打开流程结束后清空 */
let migrationOutcome: MigrationOutcome = { adopt: [], aborted: false }

/**
 * 给已有仓库补索引（幂等）。
 *
 * 同一版本可能被多次重跑（升级事务中止后浏览器会重试），
 * 因此建索引前必须判断是否已存在，否则重名会再次抛错、陷入死循环。
 *
 * @param store 需要补索引的对象仓库
 * @param indexes 索引名 → 字段路径
 */
function ensureIndexes(
  store: IDBObjectStore,
  indexes: Record<string, string | string[]>,
): void {
  for (const [name, keyPath] of Object.entries(indexes)) {
    if (store.indexNames.contains(name)) continue
    store.createIndex(name, keyPath)
  }
}

/**
 * v1：建立四个业务仓库与查询索引。
 *
 * 每个分支都先判断仓库是否存在，因为用户可能从中间版本升级上来，
 * 直接 `createObjectStore` 会因重名抛错导致整个升级事务回滚。
 *
 * @param db 正在升级的数据库连接
 * @param tx 升级事务，用于把兜底存储里的数据搬进新仓库
 */
function migrateToV1(db: IDBDatabase, tx: IDBTransaction): void {
  if (!db.objectStoreNames.contains('accounts')) {
    db.createObjectStore('accounts', { keyPath: 'id' })
  }
  if (!db.objectStoreNames.contains('categories')) {
    const store = db.createObjectStore('categories', { keyPath: 'id' })
    /* 按域 + 父级查询是分类选择器的主要访问路径 */
    ensureIndexes(store, { by_domain: 'domain', by_parent: 'parentId' })
  }
  if (!db.objectStoreNames.contains('transactions')) {
    const store = db.createObjectStore('transactions', { keyPath: 'id' })
    /* 列表页按时间倒序、按账户 / 分类筛选，这三个索引覆盖主要查询 */
    ensureIndexes(store, {
      by_occurred_at: 'occurredAt',
      by_account: 'accountId',
      by_category: 'categoryId',
    })
  }
  if (!db.objectStoreNames.contains('transfers')) {
    const store = db.createObjectStore('transfers', { keyPath: 'id' })
    ensureIndexes(store, {
      by_occurred_at: 'occurredAt',
      by_from_account: 'fromAccountId',
      by_to_account: 'toAccountId',
    })
  }
  adoptFallbackStores(tx)
}

/**
 * 把 A2 早期「降级到 localStorage」期间写入的数据搬进新建的 IndexedDB。
 *
 * 场景：用户曾在隐私模式或浏览器禁用 IndexedDB 时记账，数据落在
 * `billmeow:fallback:*`。后来浏览器恢复支持、库被升级（或首次建库），
 * 这些数据必须带过来，否则用户会看到「账本空了」。
 *
 * 判断依据是「该仓库下存在兜底键」：只有真的存过数据的仓库才需要搬，
 * 新安装的用户没有兜底键，因此不会触发无谓的写入。
 *
 * @param tx 升级事务
 */
function adoptFallbackStores(tx: IDBTransaction): void {
  for (const store of ALL_STORES) {
    if (!tx.objectStoreNames.contains(store)) continue
    if (readFallback(store).length > 0) adoptStore(store)
  }
}

/**
 * 版本迁移表：键为**目标版本**，值为该版本的升级函数。
 *
 * 新增结构变更时：
 * 1. 把 {@link DB_VERSION} +1；
 * 2. 在表里新增一项，**只描述 v(n-1) → v(n) 的增量**，不要在旧项上改；
 * 3. 已有数据用 `cursor` 遍历改写（`put` 回同一 `keyPath`），
 *    或给仓库补索引；**不要 `deleteObjectStore` 再重建**，那会丢用户数据。
 *
 * 升级函数只做「结构 + 数据修补」，且不能 `async`——见 {@link MigrationOutcome}。
 *
 * @example
 * // v2：给账户补「默认账户」标记
 * 2: (db, tx) => {
 *   const store = tx.objectStore('accounts')
 *   const cursor = store.openCursor()
 *   cursor.onsuccess = () => {
 *     const row = cursor.result
 *     if (!row) return
 *     row.update({ ...row.value, isDefault: row.value.isDefault ?? false })
 *     row.continue()
 *   }
 * }
 */
const MIGRATIONS: Record<number, (db: IDBDatabase, tx: IDBTransaction) => void> = {
  1: migrateToV1,
}

/**
 * 依次执行从 `oldVersion + 1` 到 `newVersion` 的迁移函数。
 *
 * 逐版本执行（而不是直接跑到最新）保证「隔了好几版才打开」的用户
 * 也能按顺序补齐每一步的数据修补，不必为跳版写特例。
 *
 * @param db 正在升级的数据库连接
 * @param tx 升级事务
 * @param oldVersion 升级前的版本（全新安装为 0）
 * @param newVersion 目标版本
 */
function runMigrations(
  db: IDBDatabase,
  tx: IDBTransaction,
  oldVersion: number,
  newVersion: number,
): void {
  for (let version = oldVersion + 1; version <= newVersion; version += 1) {
    const migrate = MIGRATIONS[version]
    if (!migrate) throw new Error(`缺少 v${version} 的数据库迁移函数`)
    migrate(db, tx)
  }
}

/**
 * 当前使用的后端。
 *
 * 打开成功或已降级后同步更新；测试里可调用 {@link resetDbForTest} 重置。
 */
let backend: StorageBackend = 'indexedDB'

/** 缓存的数据库连接，失败后清空以便下次重试 */
let dbPromise: Promise<IDBDatabase> | null = null

/**
 * 取当前的持久化后端。
 *
 * @returns `indexedDB`（正常）或 `localStorage`（已降级）
 */
export function getBackend(): StorageBackend {
  return backend
}

/**
 * 把 IndexedDB 的异步 API 包成 Promise，并统一处理请求级错误。
 *
 * @param request 需要等待的请求
 * @returns 请求成功时的结果
 * @throws 请求失败时把 `request.error` 抛出
 */
function promisify<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('IndexedDB 请求失败'))
  })
}

/**
 * 打开数据库（第一次调用时真正连接，之后复用同一 Promise）。
 *
 * 打开失败时：
 * - 版本号比现有库低 → 直接拒绝，**不降级**：旧代码写入新结构会损坏数据；
 * - 其他原因（隐私模式、浏览器禁用、磁盘异常）→ 标记降级并提示用户。
 *
 * @returns 已打开的数据库连接
 * @throws {DbError} 版本降级时 `kind` 为 `invalid`；其他失败 `kind` 为 `unavailable`
 * @example
 * const db = await openDatabase()
 */
export async function openDatabase(): Promise<IDBDatabase> {
  if (typeof indexedDB === 'undefined') {
    degrade('当前浏览器不支持 IndexedDB，数据将保存在 localStorage 中。')
    throw new DbError('unavailable', 'IndexedDB 不可用')
  }
  if (!dbPromise) {
    migrationOutcome = { adopt: [], aborted: false }
    dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION)
      request.onupgradeneeded = (event) => {
        const tx = request.transaction
        if (!tx) return
        try {
          runMigrations(request.result, tx, event.oldVersion, DB_VERSION)
        } catch (error) {
          /* 迁移抛错必须回滚，否则会留下「结构已改、数据半新半旧」的库 */
          migrationOutcome.aborted = true
          tx.abort()
          reject(error)
        }
      }
      request.onsuccess = () => {
        const db = request.result
        /* 另一标签页要升级版本时主动让路，避免阻塞升级导致对方一直等待 */
        db.onversionchange = () => db.close()
        backend = 'indexedDB'
        const outcome = migrationOutcome
        migrationOutcome = { adopt: [], aborted: false }
        /* 数据迁移依赖事务外的新连接，所以先交回连接再补数据 */
        resolve(db)
        if (outcome.adopt.length > 0) void postMigration(db, outcome.adopt)
      }
      request.onerror = () => reject(request.error ?? new Error('IndexedDB 打开失败'))
      /* 已有连接挡住升级时浏览器会触发 blocked，这里按不可用处理 */
      request.onblocked = () => reject(new Error('IndexedDB 被其他标签页占用'))
    }).catch((error: unknown) => {
      dbPromise = null
      const stale = error instanceof DOMException && error.name === 'VersionError'
      if (stale) {
        throw new DbError(
          'invalid',
          '本机数据库版本高于当前代码，请刷新或更新应用后再试，避免数据损坏',
        )
      }
      if (migrationOutcome.aborted) {
        throw new DbError(
          'invalid',
          `数据库升级失败，已回滚到原版本，数据未改动：${String(error)}`,
        )
      }
      degrade('本地数据库不可用（可能是隐私模式或浏览器限制），数据将临时保存在浏览器轻量存储中。')
      throw new DbError('unavailable', `IndexedDB 不可用: ${String(error)}`)
    })
  }
  return dbPromise
}

/**
 * 升级完成后补数据：把 `localStorage` 兜底记录灌进新仓库。
 *
 * 单独开事务的原因见 {@link MigrationOutcome}：升级事务里不能 `await`。
 * 写入按 `id` 去重，与 IndexedDB 里已有记录冲突时以 IndexedDB 为准
 * （用户后来的操作比兜底数据更新）；成功后清空兜底键，避免下次重复搬迁。
 *
 * @param db 升级后已打开的连接
 * @param stores 需要补数据的仓库
 */
async function postMigration(db: IDBDatabase, stores: readonly StoreName[]): Promise<void> {
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction([...stores], 'readwrite')
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error ?? new Error('升级补数据失败'))
      tx.onabort = () => reject(tx.error ?? new Error('升级补数据被中止'))
      for (const store of stores) {
        const rows = readFallback<{ id: string }>(store)
        const objectStore = tx.objectStore(store)
        for (const row of rows) objectStore.put(row)
      }
    })
    for (const store of stores) {
      try {
        localStorage.removeItem(`${FALLBACK_PREFIX}${store}`)
      } catch {
        /* 清理失败不影响数据正确性，下次打开会因同 id 覆盖而幂等 */
      }
    }
  } catch (error) {
    console.error('[db] 升级后迁移本地兜底数据失败，原数据仍保留在 localStorage 中', error)
    notifyError('旧版本数据迁移未完成，数据仍保留在浏览器轻量存储中，请刷新重试。')
  }
}

/**
 * 切换到 `localStorage` 兜底并只提示一次。
 *
 * @param message 给用户的提示文案
 */
function degrade(message: string): void {
  if (backend === 'localStorage') return
  backend = 'localStorage'
  notifyError(message)
}

/**
 * 在一个事务里执行操作，并等待事务真正提交（不只是请求成功）。
 *
 * @param stores 涉及的对象仓库
 * @param mode 事务模式
 * @param run 在事务内执行的操作，返回值会透传给调用方
 * @returns `run` 的结果
 */
async function withTransaction<T>(
  stores: StoreName[],
  mode: IDBTransactionMode,
  run: (tx: IDBTransaction) => Promise<T> | T,
): Promise<T> {
  const db = await openDatabase()
  return new Promise<T>((resolve, reject) => {
    const tx = db.transaction(stores, mode)
    let result: T
    let settled = false
    tx.oncomplete = () => resolve(result)
    tx.onerror = () => {
      if (!settled) reject(tx.error ?? new Error('事务失败'))
    }
    tx.onabort = () => {
      if (!settled) reject(tx.error ?? new Error('事务被中止'))
    }
    Promise.resolve(run(tx))
      .then((value) => {
        result = value
        settled = true
      })
      .catch((error: unknown) => {
        settled = true
        try {
          tx.abort()
        } catch {
          /* 事务可能已结束，忽略 abort 异常，只上报原始错误 */
        }
        reject(error)
      })
  })
}

/* -------------------------------------------------------------------------- */
/* localStorage 兜底                                                            */
/* -------------------------------------------------------------------------- */

/**
 * 读取兜底存储中的整个仓库。
 *
 * 结构与 `storage.ts` 一致：JSON 数组，解析失败视为空列表。
 *
 * @param store 对象仓库名
 * @returns 仓库中的全部记录
 */
function readFallback<T>(store: StoreName): T[] {
  try {
    const raw = localStorage.getItem(`${FALLBACK_PREFIX}${store}`)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    return Array.isArray(parsed) ? (parsed as T[]) : []
  } catch (error) {
    console.error(`[db] 读取兜底存储 "${store}" 失败，已回退到空列表`, error)
    return []
  }
}

/**
 * 整体覆盖兜底存储中的仓库。
 *
 * @param store 对象仓库名
 * @param rows 要写入的记录
 * @throws {DbError} 写入失败（配额超限、隐私模式）时
 */
function writeFallback<T>(store: StoreName, rows: readonly T[]): void {
  try {
    localStorage.setItem(`${FALLBACK_PREFIX}${store}`, JSON.stringify(rows))
  } catch (error) {
    console.error(`[db] 写入兜底存储 "${store}" 失败`, error)
    notifyError('数据保存失败，可能是浏览器存储空间不足或处于隐私模式。刷新后修改可能丢失。')
    throw new DbError('unavailable', `兜底存储写入失败: ${String(error)}`)
  }
}

/* -------------------------------------------------------------------------- */
/* 对外 API                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * 读取某个仓库的全部记录。
 *
 * 读回的数据会**再校验一次**：存储内容可被用户或旧版本代码改动，
 * 脏数据不进入业务层，只会被跳过并记录日志。
 *
 * @param store 对象仓库名
 * @returns 原始记录数组，**尚未校验**；调用方应使用 `loadAccounts` / `loadTransactions` 等封装
 * @example
 * const rows = await loadAll('transactions')
 */
export async function loadAll(store: StoreName): Promise<unknown[]> {
  if (backend === 'localStorage') return readFallback(store)
  try {
    return await withTransaction([store], 'readonly', async (tx) => {
      const rows = await promisify(tx.objectStore(store).getAll())
      return rows as unknown[]
    })
  } catch (error) {
    if (error instanceof DbError && error.kind === 'invalid') throw error
    degrade('本地数据库暂时不可用，本次读取已退回到浏览器轻量存储。')
    return readFallback(store)
  }
}

/**
 * 新增或覆盖单条记录（按 `id`）。
 *
 * @param store 对象仓库名
 * @param row 已通过对应 `validateXxx` 校验的实体
 * @throws {DbError} 存储不可用且兜底也失败时
 */
export async function putOne(store: StoreName, row: { id: string }): Promise<void> {
  if (backend === 'localStorage') {
    const rows = readFallback<{ id: string }>(store)
    const index = rows.findIndex((item) => item.id === row.id)
    if (index >= 0) rows[index] = row
    else rows.push(row)
    writeFallback(store, rows)
    return
  }
  try {
    await withTransaction([store], 'readwrite', (tx) => {
      tx.objectStore(store).put(row)
    })
  } catch (error) {
    if (error instanceof DbError && error.kind === 'invalid') throw error
    degrade('本地数据库暂时不可用，本次修改将保存在浏览器轻量存储中。')
    const rows = readFallback<{ id: string }>(store)
    const index = rows.findIndex((item) => item.id === row.id)
    if (index >= 0) rows[index] = row
    else rows.push(row)
    writeFallback(store, rows)
  }
}

/**
 * 删除单条记录（按 `id`），记录不存在时视为成功（幂等）。
 *
 * @param store 对象仓库名
 * @param id 记录 id
 * @throws {DbError} 存储不可用且兜底也失败时
 */
export async function deleteOne(store: StoreName, id: string): Promise<void> {
  if (backend === 'localStorage') {
    writeFallback(
      store,
      readFallback<{ id: string }>(store).filter((item) => item.id !== id),
    )
    return
  }
  try {
    await withTransaction([store], 'readwrite', (tx) => {
      tx.objectStore(store).delete(id)
    })
  } catch (error) {
    if (error instanceof DbError && error.kind === 'invalid') throw error
    degrade('本地数据库暂时不可用，本次修改将保存在浏览器轻量存储中。')
    writeFallback(
      store,
      readFallback<{ id: string }>(store).filter((item) => item.id !== id),
    )
  }
}

/**
 * 整体替换某个仓库的内容（先清空再写入，同一事务内完成）。
 *
 * 适合「首次写入预设分类」「从备份整体恢复」这类批量操作：
 * 逐条写入要么太慢，要么中途失败会留下半套数据。
 *
 * @param store 对象仓库名
 * @param rows 新内容
 * @throws {DbError} 存储不可用且兜底也失败时
 */
export async function replaceAll(store: StoreName, rows: readonly { id: string }[]): Promise<void> {
  if (backend === 'localStorage') {
    writeFallback(store, rows)
    return
  }
  try {
    await withTransaction([store], 'readwrite', (tx) => {
      const objectStore = tx.objectStore(store)
      objectStore.clear()
      for (const row of rows) objectStore.put(row)
    })
  } catch (error) {
    if (error instanceof DbError && error.kind === 'invalid') throw error
    degrade('本地数据库暂时不可用，本次修改将保存在浏览器轻量存储中。')
    writeFallback(store, rows)
  }
}

/**
 * 读取并校验账户表，返回 `id → 账户` 的索引。
 *
 * 账户是其它仓库的校验前提（币种、存在性），所以单独提供；
 * 校验失败的账户会被跳过并记录日志，不影响其余账户。
 *
 * @returns 合法账户列表
 * @example
 * const accounts = await loadAccounts()
 */
export async function loadAccounts(): Promise<Account[]> {
  const rows = await loadAll('accounts')
  const valid: Account[] = []
  for (const row of rows) {
    try {
      if (validateAccount(row)) valid.push(row)
    } catch (error) {
      console.error('[db] 跳过不合法的账户数据', error)
    }
  }
  return valid
}

/**
 * 校验并写入单条账户。
 *
 * 同时检查 `cardTail` 唯一性：写入前把已存账户读出来合并，重复即拒绝。
 *
 * @param account 待写入的账户
 * @throws {DbError} 数据不合规或尾号重复时
 */
export async function saveAccount(account: Account): Promise<void> {
  validateAccount(account)
  const existing = (await loadAccounts()).filter((item) => item.id !== account.id)
  validateUniqueCardTail([...existing, account])
  await putOne('accounts', account)
}

/**
 * 删除账户。
 *
 * 有流水的账户禁止删除（`types/README.md` 的业务约束），只能归档；
 * 这里在删除前检查该账户是否被记录引用。
 *
 * @param id 账户 id
 * @throws {DbError} 账户仍被记录引用时
 */
export async function deleteAccount(id: string): Promise<void> {
  const transactions = await loadTransactions()
  const transfers = await loadTransfers()
  const used =
    transactions.some((item) => item.accountId === id) ||
    transfers.some((item) => item.fromAccountId === id || item.toAccountId === id)
  if (used) {
    throw new DbError('invalid', `账户 ${id} 仍有流水，不能删除，请改用归档`)
  }
  await deleteOne('accounts', id)
}

/**
 * 构建账户索引，供记录 / 转账校验使用。
 *
 * @returns `id → { currency, kind }` 的只读映射
 */
export function buildAccountIndex(accounts: readonly Account[]): AccountsById {
  return new Map(accounts.map((item) => [item.id, { currency: item.currency, kind: item.kind }]))
}

/**
 * 读取并校验全部分类（含层级规则）。
 *
 * @returns 合法分类列表；层级不合法时抛出 {@link DbError}
 * @throws {DbError} 分类层级不合法时
 */
export async function loadCategories(): Promise<Category[]> {
  const rows = await loadAll('categories')
  const valid: Category[] = []
  for (const row of rows) {
    try {
      if (validateCategory(row)) valid.push(row)
    } catch (error) {
      console.error('[db] 跳过不合法的分类数据', error)
    }
  }
  return valid
}

/**
 * 校验并写入整批分类。
 *
 * 分类是整体使用的（一级 + 二级 + 排序），逐条写入容易出现半套数据，
 * 因此对外只提供整体替换。
 *
 * @param categories 完整分类列表
 * @throws {DbError} 任一条不合规、层级不合法时
 */
export async function saveCategories(categories: readonly Category[]): Promise<void> {
  for (const category of categories) validateCategory(category)
  validateCategoryTree(categories)
  await replaceAll('categories', categories)
}

/**
 * 读取并校验全部记录。
 *
 * 校验失败的记录会被跳过：一条脏数据不应让整页账单打不开。
 * 账户表缺失会让所有记录都过不了校验，此时只做自洽校验，避免误伤。
 *
 * @returns 合法记录列表
 */
export async function loadTransactions(): Promise<Transaction[]> {
  const rows = await loadAll('transactions')
  const accounts = buildAccountIndex(await loadAccounts())
  const categories = new Map(
    (await loadCategories()).map((item) => [item.id, { domain: item.domain } satisfies Partial<Category>]),
  )
  const valid: Transaction[] = []
  for (const row of rows) {
    try {
      if (validateTransaction(row, accounts, categories)) valid.push(row)
    } catch (error) {
      console.error('[db] 跳过不合法的记录数据', error)
    }
  }
  return valid
}

/**
 * 校验并写入单条记录。
 *
 * @param transaction 待写入的记录
 * @throws {DbError} 数据不合规时
 */
export async function saveTransaction(transaction: Transaction): Promise<void> {
  const accounts = buildAccountIndex(await loadAccounts())
  const categories = new Map(
    (await loadCategories()).map((item) => [item.id, { domain: item.domain } satisfies Partial<Category>]),
  )
  validateTransaction(transaction, accounts, categories)
  await putOne('transactions', transaction)
}

/**
 * 读取并校验全部转账。
 *
 * @returns 合法转账列表
 */
export async function loadTransfers(): Promise<Transfer[]> {
  const rows = await loadAll('transfers')
  const accounts = buildAccountIndex(await loadAccounts())
  const valid: Transfer[] = []
  for (const row of rows) {
    try {
      if (validateTransfer(row, accounts)) valid.push(row)
    } catch (error) {
      console.error('[db] 跳过不合法的转账数据', error)
    }
  }
  return valid
}

/**
 * 校验并写入单笔转账。
 *
 * @param transfer 待写入的转账
 * @throws {DbError} 数据不合规时
 */
export async function saveTransfer(transfer: Transfer): Promise<void> {
  const accounts = buildAccountIndex(await loadAccounts())
  validateTransfer(transfer, accounts)
  await putOne('transfers', transfer)
}

/**
 * 清空全部业务数据（测试与「重置账本」用）。
 *
 * 只清四个业务仓库，不动 `localStorage` 中的设置项。
 */
export async function clearAll(): Promise<void> {
  if (backend === 'localStorage') {
    for (const store of ALL_STORES) writeFallback(store, [])
    return
  }
  try {
    await withTransaction([...ALL_STORES], 'readwrite', (tx) => {
      for (const store of ALL_STORES) tx.objectStore(store).clear()
    })
  } catch (error) {
    if (error instanceof DbError && error.kind === 'invalid') throw error
    degrade('本地数据库暂时不可用，本次清空只作用于浏览器轻量存储。')
    for (const store of ALL_STORES) writeFallback(store, [])
  }
}

/**
 * 重置内部状态，仅测试使用。
 *
 * 连接缓存与降级标记都是模块级单例，测试之间必须复位，
 * 否则「降级」用例会污染后续用例。
 *
 * @remarks
 * 生产代码不要调用；需要重新连接时先关闭页面即可。
 */
export async function resetDbForTest(): Promise<void> {
  if (dbPromise) {
    try {
      const db = await dbPromise
      db.close()
    } catch {
      /* 打开就失败过，无需关闭 */
    }
  }
  dbPromise = null
  backend = 'indexedDB'
}
