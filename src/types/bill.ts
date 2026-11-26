/**
 * 账单领域数据模型（数据层）
 *
 * 设计要点：
 * - **金额一律以整数最小单位（number）存储**，避免浮点误差；界面展示时再转成具体的币种。
 * - 账户/分类/记录均带 `id`，便于持久化与后续多端同步合并。
 * - 负债账户的余额为负数（消费后更负，还款后向 0 靠近），
 *   净资产 = 所有账户余额之和，与 DESIGN.md 3/4.3 节规则一致。
 *
 * @remarks
 * **分层契约**：本文件只放业务实体与换算常量，**不得 import `./ui`**。
 * 展示文案、图标、颜色、排序、分组一律放 `./ui.ts`，依赖方向只能是 `ui.ts → bill.ts`。
 * 需要把两者组合（如账户卡片视图）时，写到 `src/lib/` 的纯函数里。
 *
 * 处理金额前**务必先读同目录的 `README.md`（类型层约定）**。
 * 金额存的是「单个整数最小单位」，不是小数，也不是 `{整数部分, 小数部分}`；
 * 元与分之间的倍数请按 `CurrencyMeta.decimals` 计算，不要硬编码乘 100。
 * @see ./README.md
 */

/** 记账域：支出或收入；分类、记录都按此区分 */
export type BillDomain = 'expense' | 'income'

/** 账户类型：资产（余额通常为正）或负债（余额为负） */
export type AccountKind = 'asset' | 'liability'

/**
 * 支持的币种代码（ISO 4217）。
 *
 * 覆盖人民币与常见外币。
 * 新增币种时同步更新 {@link CURRENCY_MAP}（漏写会编译报错）。
 */
export type CurrencyCode =
  | 'CNY'
  | 'USD'
  | 'EUR'
  | 'JPY'
  | 'HKD'
  | 'TWD'
  | 'CAD'
  | 'GBP'
  | 'CHF'
  | 'AUD'
  | 'SGD'
  | 'KRW'
  | 'THB'
  | 'VND'

/**
 * 币种的计算元数据。
 *
 * 只有小数位数：币种代码已经是 {@link CURRENCY_MAP} 的键，不需要在值里重复。
 * 重复会让「键是 CNY、值是 USD」这种错位编译期检不出来。
 *
 * 币种的中文名、符号等展示信息属于 UI 层，见同目录 `ui.ts`，
 * 不要混进这里——数据层只管「怎么算」，不管「怎么显示」。
 */
export interface CurrencyMeta {
  /**
   * 小数位数，用于整数最小单位与元之间的换算（倍数 = `10 ** decimals`）：
   * JPY / KRW / VND 无小数（0 位），其余为 2 位。
   */
  decimals: number
}

/**
 * 全部币种元数据，**以币种代码为键**，用于 O(1) 查询。
 *
 * 类型是 `Record<CurrencyCode, CurrencyMeta>`，因此 {@link CurrencyCode}
 * 每新增一个币种，这里漏写会在**编译期**直接报错，不会拖到运行时才发现。
 *
 * @example
 * CURRENCY_MAP.CNY.decimals  // 2
 * CURRENCY_MAP.JPY.decimals  // 0
 */
export const CURRENCY_MAP: Readonly<Record<CurrencyCode, CurrencyMeta>> = {
  CNY: { decimals: 2 },
  USD: { decimals: 2 },
  EUR: { decimals: 2 },
  JPY: { decimals: 0 },
  HKD: { decimals: 2 },
  TWD: { decimals: 2 },
  CAD: { decimals: 2 },
  GBP: { decimals: 2 },
  CHF: { decimals: 2 },
  AUD: { decimals: 2 },
  SGD: { decimals: 2 },
  KRW: { decimals: 0 },
  THB: { decimals: 2 },
  VND: { decimals: 0 },
}

/**
 * 判断任意值是否为受支持的币种代码。
 *
 * 供持久化层（A2）校验来自 localStorage / CSV 导入的外部数据：
 * 这些数据的静态类型不可信，必须先过一遍守卫再交给 {@link getCurrency}。
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
 * 按币种代码取元数据。
 *
 * 参数类型是 {@link CurrencyCode}，正常情况下 `if` 分支不可达；
 * 保留它是为了拦住「用 `as CurrencyCode` 把脏数据强转进来」的情况
 * （典型场景：localStorage 读回的数据）。正规的外部数据应先过 {@link isCurrencyCode}。
 *
 * 非法代码抛错而不是静默回退到人民币——静默回退会让
 * 「币种写错」这类 bug 一直藏到金额显示异常时才暴露。
 *
 * @param code 币种代码
 * @returns 对应的币种元数据
 * @throws 当 `code` 不在 {@link CURRENCY_MAP} 中时抛出
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
 * 账户，可以是资产账户（储蓄卡、现金…）或负债账户（花呗、信用卡…）。
 *
 * @remarks
 * 初始余额可正可负：负债账户创建时填负数（如 -1200 表示待还 1200 元），
 * 之后通过「支出」（使它更负）与「转账还款」（使它趋近 0）变化。
 */
export interface Account {
  /** 唯一标识（建议 `crypto.randomUUID()`） */
  id: string
  /** 账户名称 */
  name: string
  /** 账户类型 */
  kind: AccountKind
  /** 币种，默认 CNY；可选值见 {@link CURRENCY_MAP} */
  currency: CurrencyCode
  /** 卡号后四位，可选，用于 CSV 导入自动关联去重 */
  cardTail?: string
  /** 初始余额（整数最小单位，负债为负） */
  initialBalance: number
  /** 是否归档停用，归档后不出现在记账可选列表中 */
  archived: boolean
}

/**
 * 分类，采用「一级大类 + 二级子分类」的统一结构。
 *
 * @remarks
 * 子分类也使用本结构，通过 `parentId` 指向父级；父级自身 `parentId` 为空。
 * 内置分类不可删除，只能隐藏；自定义分类可任意增删改。
 */
export interface Category {
  /** 唯一标识 */
  id: string
  /** 分类名称 */
  name: string
  /** 所属域：支出 or 收入 */
  domain: BillDomain
  /** 父级分类 id；为空表示一级大类 */
  parentId?: string
  /** 是否内置预设（内置不可删除，仅可隐藏/改名） */
  builtin: boolean
  /** 是否隐藏，隐藏后不出现在选择器中 */
  hidden?: boolean
  /** 排序序号，数值小的排前面 */
  order?: number
}

/**
 * 一笔支出或收入记录。
 *
 * @remarks
 * 转账请用 {@link Transfer}，不要用本类型硬凑，否则会污染当月收支统计。
 *
 * **业务边界判据**：`expense` / `income` 衡量的是**净资产**的跨界变化，
 * 而不是某个资产账户余额的变化——记在负债账户上的消费同样使净资产减少，
 * 因此仍属 `expense`（详见 README 的「业务边界判定」）。
 *
 * `currency` 与 `amount` 在同一对象里成对保存，防止「金额与币种靠账户间接绑定」
 * 导致的对不上问题：
 * - 账户日后改币种，历史记录的单位不会被改写；
 * - 读取记录时无需联表查账户即可格式化显示。
 *
 * 铁律：`currency` 必须与 `accountId` 指向账户当前币种一致，由 A2 持久化层校验。
 */
export interface Transaction {
  /** 唯一标识 */
  id: string
  /** 所属域：支出 or 收入 */
  domain: BillDomain
  /** 金额（整数最小单位，始终为正数，方向由 `domain` 决定） */
  amount: number
  /** 该笔金额的币种，须与 `accountId` 账户的币种一致 */
  currency: CurrencyCode
  /** 分类 id（二级子分类优先，也允许直接选一级大类） */
  categoryId: string
  /** 账户 id（必填，默认账户策略见 README） */
  accountId: string
  /** 记账日期，ISO 日期字符串，形如 `2026-11-26` */
  date: string
  /** 备注 */
  note?: string
  /** 创建时间戳（毫秒），用于排序与同步冲突判定 */
  createdAt: number
  /** 最后修改时间戳（毫秒），用于多端合并 */
  updatedAt: number
}

/**
 * 转账业务类型，仅用于界面文案与统计归类，**不影响任何金额计算**。
 *
 * - `internal`：资产 ↔ 资产，换卡 / 换汇 / 账户间调拨
 * - `repayment`：资产 → 负债，还款（还花呗、信用卡）
 * - `borrowing`：负债 → 资产，借款到账
 * - `liabilityInternal`：负债 ↔ 负债，卡片间转移欠款
 */
export type TransferKind = 'internal' | 'repayment' | 'borrowing' | 'liabilityInternal'

/**
 * 判断转账的默认业务类型（未显式指定 `kind` 时使用）。
 *
 * @param fromKind 转出账户类型
 * @param toKind 转入账户类型
 * @returns 由两个账户类型推导出的转账类型
 * @example
 * resolveTransferKind('asset', 'liability')  // 'repayment'
 * resolveTransferKind('liability', 'liability')  // 'liabilityInternal'
 */
export function resolveTransferKind(fromKind: AccountKind, toKind: AccountKind): TransferKind {
  if (fromKind === 'asset' && toKind === 'asset') return 'internal'
  if (fromKind === 'asset' && toKind === 'liability') return 'repayment'
  if (fromKind === 'liability' && toKind === 'asset') return 'borrowing'
  return 'liabilityInternal'
}

/**
 * 一笔账户间转账（内部资金流动）。
 *
 * @remarks
 * 铁律：转账只改变资金所在账户，**不计入当月收支、不影响总净资产**。
 * - 偿还欠款：资产账户 → 负债账户（如还花呗）
 * - 借款入账：负债账户 → 资产账户
 * - 资产互转：资产账户 → 资产账户
 * - 负债互转：负债账户 → 负债账户
 *
 * **转出 / 转入两侧各自记录金额与币种**，以支持跨币种场景（外汇购汇、结汇、
 * 多币种账户换汇）：
 * - 同币种互换：`fromAmount === toAmount`，`fromCurrency === toCurrency`
 * - 跨币种换汇：`fromAmount: 10000`(USD/100.00)、`toAmount: 73000`(CNY/730.00)，
 *   隐含汇率可由 `toAmount` / `fromAmount` 反推，无需单独存汇率字段。
 *
 * 两侧金额均恒为正数，资金方向由 `fromAccountId → toAccountId` 表示。
 */
export interface Transfer {
  /** 唯一标识 */
  id: string
  /** 转出账户 id */
  fromAccountId: string
  /** 转出金额（整数最小单位，恒为正） */
  fromAmount: number
  /** 转出币种，须与 `fromAccountId` 账户的币种一致 */
  fromCurrency: CurrencyCode
  /** 转入账户 id */
  toAccountId: string
  /** 转入金额（整数最小单位，恒为正）；跨币种换汇时与 `fromAmount` 不同 */
  toAmount: number
  /** 转入币种，须与 `toAccountId` 账户的币种一致 */
  toCurrency: CurrencyCode
  /**
   * 转账业务类型；缺省时按两侧账户类型用 {@link resolveTransferKind} 推断。
   * 仅用于展示与统计归类，不参与金额计算。
   */
  kind?: TransferKind
  /** 转账日期，ISO 日期字符串，形如 `2026-11-26` */
  date: string
  /** 备注 */
  note?: string
  /** 创建时间戳（毫秒） */
  createdAt: number
  /** 最后修改时间戳（毫秒） */
  updatedAt: number
}
