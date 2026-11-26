/**
 * 账单领域数据模型（数据层）
 *
 * 设计要点：
 * - **金额一律存整数最小单位**（如 3.14 元存 `314`），类型为 `number`（整数），
 *   避免浮点累加误差。
 * - 展示或接收用户输入时，按币种的 `CurrencyMeta.decimals` 换算回实际金额
 *   （倍数 = `10 ** decimals`），不要硬编码乘 100。
 * - 账户/分类/记录均带 `id`，便于持久化与后续多端同步合并。
 * - 负债账户的余额为负数（消费后更负，还款后向 0 靠近），
 *   净资产 = 所有账户余额之和，与 DESIGN.md 3/4.3 节规则一致。
 *
 * @remarks
 * **分层契约**：本文件只放业务实体与换算常量，**不得 import `./ui`**。
 * 展示文案、图标、颜色、排序、分组一律放 `./ui.ts`，依赖方向只能是 `ui.ts → bill.ts`。
 * 需要把两者组合（如账户卡片视图）时，写到 `src/lib/` 的纯函数里。
 *
 * 金额是单个整数，不是小数，也不是 `{整数部分, 小数部分}`。
 * 
 * 处理金额前**务必先读同目录的 `README.md`（类型层约定）**。
 * @see ./README.md
 */

/** 记账域：支出或收入；分类、记录都按此区分 */
export type BillDomain = 'expense' | 'income'

/** 账户类型：资产（余额通常为正）或负债（余额为负） */
export type AccountKind = 'asset' | 'liability'

/**
 * 消费 / 转账时间的精度。
 *
 * - `minute`：真实时刻（用户填写、AI 识别小票、CSV 带时分）。可参与按时间差的去重判断。
 * - `day`：只知日期，时刻是补齐值（当前约定为当天 `12:00`）。
 *
 * @remarks
 * 用正午补齐而不是零点：正午向前后各留 12 小时余量，时区偏移或夏令时
 * 不会让它跨到前一天或后一天。
 *
 * 补齐值的账单**不能**按时间差判重——同一天多笔同额消费都会被补成 `12:00`，
 * 因此去重时需退化为「同天 + 同金额 + 同账户」或通过其他条件判断。
 */
export type OccurredPrecision = 'minute' | 'day'

/**
 * 去重匹配的相似程度，供 UI 区分展示，但属于业务逻辑，定义在数据层。
 *
 * - `exact`：时间差、金额、账户、分类全部吻合，高度疑似同一笔，依然需要人工确认
 * - `similar`：仅金额与账户等核心字段吻合，时间只到天，需要人工确认
 *
 * @remarks
 * 本类型只用于界面标记，**不代表系统会自动删除**任何记录，
 * 是否合并或删除一律由用户决定。
 */
export type DuplicateMatchLevel = 'exact' | 'similar'

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
 * 只有小数位数 `decimals` 这一项：币种代码本身已是 {@link CURRENCY_MAP} 的键，无需在值里重复。
 *
 * 币种的中文名、符号等展示信息属于 UI 层，见同目录 `ui.ts`，不要混进这里，
 * 因为数据层只管「怎么算」，不管「怎么显示」。
 */
export interface CurrencyMeta {
  /**
   * 小数位数，整数最小单位与实际金额之间的换算倍数 = `10 ** decimals`：
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
 * 查表与校验函数在 `src/lib/currency.ts`（本文件只放声明，不放可执行逻辑）。
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
 * 汇率的存储倍数：汇率一律乘以 `10^8` 后以整数存储，即保留 8 位小数。
 *
 * 指数 8 就是小数位数，与金额的 `10 ** decimals` 是同一套思路，只是位数固定且更大。
 *
 * 为什么不用金额那套 `10^decimals`：汇率的精度需求比金额高得多。
 * JPY → CNY 这类汇率只有 `0.047`，按两位小数存会变成 `0.05`，误差超过 5%。
 *
 * 为什么是 8 位而不是 6 位：6 位在大额兑换时会丢分。
 * 例：换 100 万 JPY，汇率的 6 位截断误差 `5×10^-7` 会导致 `1000000 × 5×10^-7 = 0.5` 单位的偏差，
 * 已经可见；8 位时该偏差降到 `0.005`，低于「分」的精度，任何场景都不可观测。
 *
 * `Number.MAX_SAFE_INTEGER` 约 `9.007×10^15`，配合 8 位可表示到 `9×10^7` 的汇率，
 * 远超任何真实汇率区间（`0.00000001 ~ 1000`）。
 *
 * @example
 * 7.3      → 730000000
 * 0.047523 → 4752300
 */
export const RATE_SCALE = 10 ** 8

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
 * 跨境 / 跨币种交易的原始交易信息。
 *
 * 用于「交易币种 ≠ 记账币种」的场景：例如用 CNY 账户支付一笔 1000 JPY 的订单，
 * 记账金额是账户实际扣款（`Transaction.amount`，CNY），而原始交易是 1000 JPY。
 * 两者都保留，才能既算准余额，又显示「1000 JPY ≈ 68.50 CNY」。
 *
 * @remarks
 * 三个字段**同时存在或同时缺席**，由 `Transaction.foreign` 整体承载，
 * 避免「填了一半」的中间状态。同币种交易不填本对象。
 */
export interface ForeignExchange {
  /** 原始交易金额（整数最小单位，以 `currency` 为准） */
  amount: number
  /** 原始交易币种 */
  currency: CurrencyCode
  /**
   * 交易时的汇率（整数，乘以 {@link RATE_SCALE}，即 8 位小数）。
   * 方向：`1 单位 currency 可兑换 rate / RATE_SCALE 单位记账币种`。
   */
  rate: number
}

/**
 * 一笔支出或收入记录。
 *
 * @remarks
 * **与 `Transfer` 的区别**：本类型只表示资金跨越资产边界（外部与内部的进/出），
 * 账户之间的资金（内部与内部）流动请用 {@link Transfer}。
 * 如果把转账硬塞进本类型，会让它被算进当月收支，统计失真。
 *
 * **为什么每笔都要存 `currency`**：`amount` 是整数最小单位，脱离币种就没有意义
 * （`314` 可能是 3.14 元，也可能是 314 日元）。若靠 `accountId` 反查账户币种，
 * 会导致两个问题：
 * - 账户后续更改币种会篡改历史记录的金额含义；
 * - 列表渲染要额外联表。
 *
 * 铁律：`currency` 必须与 `accountId` 指向账户当前币种一致，由 A2 持久化层校验。
 */
export interface Transaction {
  /** 唯一标识 */
  id: string
  /**
   * 所属域：支出 or 收入。
   *
   * 判据是**净资产**是否变化，不是「资产账户余额是否减少」：
   * 花呗（负债账户）刷卡消费同样记为 `expense`，因为欠款增加、净资产减少。
   */
  domain: BillDomain
  /** 金额（整数最小单位，始终为正数，方向由 `domain` 决定） */
  amount: number
  /** 该笔金额的币种，须与 `accountId` 账户的币种一致 */
  currency: CurrencyCode
  /** 分类 id（二级子分类优先，也允许直接选一级大类） */
  categoryId: string
  /** 账户 id（必填，默认账户策略见 README） */
  accountId: string
  /**
   * 消费发生时间，分钟精度，本地时区，形如 `2026-11-26T08:30`。
   *
   * 不用毫秒：实际来源（手动 / AI 识别 / CSV 导入）最多精确到分钟，
   * 毫秒位只是噪声，还会诱导调用方误以为可以靠毫秒差判重复。
   */
  occurredAt: string
  /** 消费时间的精度，决定去重时能否按时间差比较，见 {@link OccurredPrecision} */
  occurredPrecision: OccurredPrecision
  /**
   * 原始交易信息，仅当「交易币种 ≠ 记账币种」时填写。
   *
   * 例：用 CNY 账户支付 1000 JPY 的订单，`amount` / `currency` 记账户实际扣款（CNY），
   * 本字段记原始交易的 1000 JPY 与当时的汇率。
   * 同币种交易留空，不要为了「字段整齐」塞一个汇率 1 的对象。
   */
  foreign?: ForeignExchange
  /** 备注 */
  note?: string
  /**
   * 创建时间戳（毫秒）。
   *
   * **不是消费时间**：补录小票、隔几天才记账时，它与 `occurredAt` 可能差很多天，
   * 因此不能用来替代消费时间，也不能单独作为去重依据。
   * 它的作用是：为 AI 自动记账等「消费即入库」的场景提供辅助判断，
   * 以及排序与多端同步的冲突判定。
   */
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
 * - `liabilityInternal`：负债 ↔ 负债，卡片间转移欠款（例如信用卡还信用卡）
 */
export type TransferKind = 'internal' | 'repayment' | 'borrowing' | 'liabilityInternal'

/**
 * 一笔账户间转账（内部资金流动）。
 *
 * @remarks
 * 铁律：转账只改变资金所在账户（内部之间流动），**不计入当月收支、不影响总净资产**。
 * - 偿还欠款：资产账户 → 负债账户（如还花呗）
 * - 借款入账：负债账户 → 资产账户
 * - 资产互转：资产账户 → 资产账户
 * - 负债互转：负债账户 → 负债账户 (如信用卡还信用卡)
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
   * 录入时的汇率（整数，乘以 {@link RATE_SCALE}，即 8 位小数）。**必填，不可为空**。
   *
   * 方向：`1 单位 fromCurrency = rate / RATE_SCALE 单位 toCurrency`
   * （即 `rate = toAmount折元 / fromAmount折元 × RATE_SCALE`）。
   *
   * **同币种转账填 `RATE_SCALE`（即 1.0）**，不要留空：字段恒有值，
   * 调用方不必为「没有汇率」写特殊分支，也避免「undefined 到底表示 1 还是未知」的歧义。
   *
   * **只用于溯源与展示，不参与金额计算**：真实金额已固化在 `fromAmount` / `toAmount` 中。
   * 保留它有两个用途：
   * - 追溯这笔账当时按什么汇率换的；
   * - 用 `rate × fromAmount` 重算 `toAmount`，与存档值比对，即可看出用户手动调整了多少差额
   *   （例如银行实际成交价与牌价不同，用户改了金额）。
   *
   * 反推值受四舍五入影响，不如本字段准确；需要反推时见 README「反推汇率」。
   */
  rate: number
  /**
   * 转账业务类型；缺省时按两侧账户类型用 {@link resolveTransferKind} 推断。
   * 仅用于界面文案与统计归类，不参与净资产等任何金额计算。
   */
  kind?: TransferKind
  /**
   * 转账发生时间，分钟精度，本地时区，形如 `2026-11-26T08:30`。
   * 精度约定与 {@link Transaction.occurredAt} 一致。
   */
  occurredAt: string
  /** 转账时间的精度，见 {@link OccurredPrecision} */
  occurredPrecision: OccurredPrecision
  /** 备注 */
  note?: string
  /** 创建时间戳（毫秒）；含义同 {@link Transaction.createdAt} */
  createdAt: number
  /** 最后修改时间戳（毫秒） */
  updatedAt: number
}
