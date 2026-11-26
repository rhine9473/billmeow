# 类型层约定（必读）

> 适用范围：`src/types/` 下的全部文件
> - `bill.ts`：数据模型与计算属性
> - `ui.ts`：纯展示属性
>
> 涉及后续 A5 store 汇总、A6 `src/lib/money.ts`、B1/B2 记账表单、C1 列表展示、CSV 导入导出。
>
> 本文档依据多轮讨论整理，回答以下问题：分层怎么切（类型层无逻辑）、
> 金额怎么存（整数最小单位）、币种怎么绑定（每笔自带）、输入怎么校验（分层 + `isSafeInteger`）、
> 账户是否必填（必填，用默认账户做体验兜底）、收支与转账怎么划界（看净资产变化）。

---

## 分层：类型层只放声明

| 位置 | 放什么 | 禁止 |
| ---- | ------ | ---- |
| `src/types/bill.ts` | 业务实体、枚举、换算常量，以及**仅依赖本文件的纯查表/派生函数** | 展示文案、图标、颜色、排序、分组 |
| `src/types/ui.ts` | 展示属性：币种名称/符号、账户图标/颜色、账户分组 | 金额计算、业务判定 |
| `src/lib/` | **跨文件组合逻辑**，如把 `bill.ts` 与 `ui.ts` 的数据拼成 `AccountView` | 组件、Pinia store |
| `src/stores/` | Pinia 状态与派生 getter | — |

**关键约束**：`bill.ts` **不得** import `ui.ts`。数据层不依赖 UI 层，否则分层失效。
方向只能是 `ui.ts → bill.ts`。

**为什么没有 `index.ts`**：本项目多人多分支并行开发，且 UI 层会持续膨胀。
汇总入口是共享文件、易冲突，且 `export *` 遇到重名会**静默失效**（不报错，名字直接消失）。
因此调用方显式写路径：`from '../types/bill'` 或 `from '../types/ui'`——
import 路径本身就是分层声明，code review 时一眼能看出依赖方向。

**组合不要散在组件里**：每个组件各拼一遍「账户 + 视觉 + 币种展示」会导致
兜底逻辑重复且各写各的。统一写成 `src/lib/` 的纯函数，组件只调一次。
组合函数**不要读 store**，参数传入 `visuals` / `groups` 即可保证可单测。

---

## `ui.ts` 提供什么

| 导出 | 用途 |
| ---- | ---- |
| `CurrencyDisplay` / `CURRENCY_DISPLAY` / `getCurrencyDisplay()` | 币种名称与符号（多语言时只改这里） |
| `AccountVisual` / `AccountVisualMap` | 账户的 `icon` 与 `color`，按 `Account.id` 索引 |
| `AccountGroup` / `AccountGroupMap` | 账户分组，按 `Account.id` → `AccountGroup.id` |

### 账户视觉：`icon` 与 `color` 分开

不要用一个字段混存「图标或颜色」再靠 `#` 前缀猜语义。两个字段独立、可同时存在
（常见做法：`color` 做背景、`icon` 做前景图形），都没有时由 UI 兜底。

### 账户分组：只影响展示

分组解决「账户列表太长想折叠」的问题，**不参与任何金额计算**。
总资产仍按每个 `Account` 单独累加，分组只是让列表更清爽。
因此分组信息不写进 `Account`，也不进 `bill.ts`。

> 想按「同一张卡」自动分组时，`Account.cardTail` 可以直接作为依据，不必让用户手动建组。

---

## 一句话规则

**金额一律存「整数最小单位」的单个整数，不存小数、不存 `{整数部分, 小数部分}`。**

```ts
amount: 314   /* 表示 3.14 元（CNY） */
amount: 314   /* 表示 314 日元（JPY） */
```

---

## 为什么不能存浮点数

浮点数不能精确表示大多数十进制小数：

```ts
0.1 + 0.2 // 0.30000000000000004  ← 这就是要避免的
```

记账应用里金额会频繁累加（当月支出、账户余额、总资产），
误差会一次次累积放大，最终出现「账单加起来比实际多 1 分」这类事故。
改用整数运算后，`+ - * /` 在整数范围内都是精确的。

```ts
/* 实测：浮点累加 vs 整数累加 */
let sum = 0
for (let i = 0; i < 10; i++) sum += 0.1
sum                        /* 0.9999999999999999 ← 错 */

let minor = 0
for (let i = 0; i < 10; i++) minor += 10
minor / 100                /* 1 ← 对 */
```

---

## 正确的做法

### 单个整数，按「10^decimals」放大

| 币种 | `decimals` | 真实金额 | 存储值 | 倍数 |
| ---- | ---------- | -------- | ------ | ---- |
| CNY / USD / EUR / HKD / TWD / THB … | 2 | 3.14 元 | `314` | × 100 |
| JPY / KRW / VND | 0 | 314 日元 | `314` | × 1 |
| KWD（将来若加） | 3 | 3.140 第纳尔 | `3140` | × 1000 |

倍数**不是固定的 100**，一律按币种的 `decimals` 计算（用 `getCurrency(code).decimals` 取值）：

```ts
const factor = 10 ** decimals
```

### 换算时四舍五入

```ts
/** 元（小数）→ 整数最小单位 */
function toMinor(amount: number, decimals: number): number {
  return Math.round(amount * 10 ** decimals)
}

/** 整数最小单位 → 元（小数） */
function toMajor(minor: number, decimals: number): number {
  return minor / 10 ** decimals
}
```

`Math.round` 不能省。部分十进制数在二进制浮点里无法精确表示，乘出来会带尾巴：

```ts
8.55 * 100   // 855.0000000000001   ← 脏值
0.29 * 100   // 28.999999999999996  ← 脏值，不 round 会被截成 28
4.35 * 100   // 434.99999999999994  ← 脏值，不 round 会被截成 434
1.005 * 100  // 100.49999999999999  ← 脏值
```

注意 `3.14 * 100` 恰好是干净的 `314`，**不要拿它当反例**——真正踩坑的是 `0.29`、`4.35`、`8.55` 这类值。
所以不能靠「挑几个数试一下没问题」来判断，必须无条件 round。

---

## 是否需要「转换后比对校验」

结论：**换算结果不需要额外比对校验，`Math.round` 就够了。**
但有几个场景值得单独说明。

### 1. `toMinor` / `toMajor` 往返：不需要断言

```ts
const minor = toMinor(8.55, 2)        /* 855 */
const back = toMajor(minor, 2)        /* 8.55 */
```

往返后 `back === 8.55` 成立（`855 / 100` 精确可表示）。
唯一不相等的情况出现在**输入本身精度已经超过 `decimals`**：

```ts
toMinor(1.005, 2)   /* 100（四舍五入到分，第三位被丢弃） */
toMajor(100, 2)     /* 1.00 ≠ 1.005 ← 期望的精度丢失，不是 bug */
```

所以不要写「往返断言相等」的测试，除非输入的小数位 ≤ `decimals`。
正确做法是校验**语义**：换算结果必须是整数、且落在合理范围。

### 2. 值得校验的地方：金额输入入口

用户输入的字符串不要直接 `parseFloat` 后就用，先校验格式。

#### 先解决一个问题：`decimals` 从哪来

`decimals` **不在输入参数里，而是由币种查出来的**。
调用方必须告诉函数「这笔钱属于哪个账户的哪种币种」：

```
用户输入 "1.005"  +  账户 currency: 'CNY'
        ↓                    ↓
   解析字符串          getCurrency('CNY').decimals → 2
        ↓                    ↓
   parseAmount('1.005', 2) → null（小数位超限）
```

#### 分层写法（推荐）

底层只认 `decimals`，纯数学；上层负责从币种查表。
这样 A6 的 `money.ts` 不依赖币种表，可作为纯函数单测。

```ts
/* 底层：纯数学，与币种无关，可放 src/lib/money.ts */
/** 按小数位数解析金额字符串，非法返回 null */
function parseAmount(input: string, decimals: number): number | null {
  const text = input.trim()
  if (!/^\d+(\.\d+)?$/.test(text)) return null   /* 基础格式：纯数字 + 可选小数 */

  /* 小数位数直接数，不拼动态正则——避免 decimals 为 0 时构造出非法量词 */
  const dot = text.indexOf('.')
  const frac = dot === -1 ? 0 : text.length - dot - 1
  if (frac > decimals) return null

  const minor = Math.round(Number(text) * 10 ** decimals)
  return Number.isSafeInteger(minor) ? minor : null
}

/* 上层：从币种查 decimals 再调底层 */
/** 按币种解析金额字符串，非法返回 null */
function parseAmountForCurrency(input: string, currency: CurrencyCode): number | null {
  return parseAmount(input, getCurrency(currency).decimals)
}
```

> 不要写 `CURRENCY_MAP[c] ?? CURRENCY_MAP.CNY` 这类写法——
> 币种不合法时会**静默回退人民币**，把 bug 掩盖成「显示了一个错误但看似正常的金额」。
> 统一用 `getCurrency()`，非法币种直接抛错。

#### 外部数据先过 `isCurrencyCode`

`getCurrency()` 的参数类型是 `CurrencyCode`，类型系统已保证合法。
从 localStorage / CSV 导入拿到的值静态类型不可信，**必须先用守卫函数收窄**：

```ts
if (!isCurrencyCode(raw.currency)) {
  /* 丢弃该记录或回退默认币种，并记日志 */
  continue
}
const decimals = getCurrency(raw.currency).decimals   /* 此处 raw.currency 已收窄 */
```

> 注意 `isCurrencyCode` 内部用 `Object.hasOwn`，不是 `in`。
> `in` 会命中原型链，`'toString' in CURRENCY_MAP` 为 `true`，会把 `toString` 当成合法币种。

> 币种列表的排序、中文名与符号都在 `ui.ts`，见上文「分层」与「`ui.ts` 提供什么」。

| 输入 | 币种 | `decimals` | 结果 |
| ---- | ---- | ---------- | ---- |
| `'12.34'` | CNY | 2 | `1234` |
| `'1.005'` | CNY | 2 | `null`（小数位超限） |
| `'1005'` | JPY | 0 | `1005` |
| `'1.5'` | JPY | 0 | `null` |
| `'abc'` | 任意 | 任意 | `null` |
| `'1e5'` | 任意 | 任意 | `null`（科学计数法被基础正则拦住） |

> **`decimals = 0` 陷阱**：不要用动态拼正则的写法，例如
> `new RegExp('^\d+(\.\d{1,' + decimals + '})?$')`。
> `decimals` 为 0 时会得到 `\d{1,0}`，这是非法量词，构造函数直接抛 `SyntaxError`。
> 改成「数小数位数」的写法后自然没这个问题。

这里的三道校验才是真正必要的：

- **小数位限位**：小数位超过 `decimals` 直接拒绝，而不是悄悄截断
- **`Number.isSafeInteger`**：金额超过 `2^53` 后整数运算不再精确（约 9 万亿分 = 900 亿元，正常记账碰不到，但输入框里能敲进去）
- **`NaN` 拦截**：`Number('abc')` 是 `NaN`，`Math.round(NaN)` 仍是 `NaN`，会静默污染所有汇总

### 3. 值得校验的地方：反推汇率

跨币种转账反推汇率时，`fromAmount` 可能为 0，会导致除零：

```ts
/* 错误：fromAmount 为 0 时得到 Infinity */
const rate = toMajor(toAmount, toDec) / toMajor(fromAmount, fromDec)

/* 正确：先挡掉除零 */
const fromMajor = toMajor(fromAmount, fromDec)
const rate = fromMajor > 0 ? toMajor(toAmount, toDec) / fromMajor : null
```

### 4. 不需要校验的地方

- **汇总求和**：整数相加在安全整数范围内恒精确，不需要每次加完再校验
- **`a === b` 比较**：整数直接比即可，不需要 `epsilon`

> 一句话：`Math.round` 保证**换算**正确；`Number.isSafeInteger` + 输入校验保证**输入**合法；
> 求和与比较不需要额外校验。

---

## 常见的错误做法（请勿照做）

### 错误 1：把金额拆成整数部分和小数部分

```ts
/* 错误：不要把金额存成这种结构 */
interface BadAmount {
  integer: number   /* 3 */
  fraction: number  /* 14 */
}
```

问题：
- 加减要自己处理进位、小数部分是否 ≥ 100，代码复杂且极易出错
- JSON 里变嵌套对象，体积变大
- 无法直接参与 `sum()` 等数组汇总

> 注意区分：`{ value: 314, scale: 3 }` 这种「整数 + 小数位数」的定点数（scaled integer）
> 是另一种**合理**方案（Kotlin `BigDecimal`、PostgreSQL `NUMERIC` 都用它），
> 但它要求每笔金额自带 scale，所有求和都要先对齐 scale，改动面和出错面都大得多。
> 本项目采用**按币种固定 decimals** 的单整数方案，不混用。

### 错误 2：硬编码乘 100

```ts
/* 错误：JPY / KRW / VND 没有小数位，会被放大 100 倍 */
const cents = Math.round(yuan * 100)
```

问题：JPY 的 `314` 日元应该是 `314`，硬乘 100 变成 `31400`；
VND 同理，10 万越南盾存成 `100000`，硬乘 100 会变一千万。

**正确写法**：始终按 `decimals` 计算。

### 错误 3：用 `Number.toFixed` / `parseFloat` 做精确比较

```ts
/* 错误：toFixed 返回字符串，比较会出错；parseFloat 又会引入浮点 */
if (parseFloat(a.toFixed(2)) === parseFloat(b.toFixed(2))) { /* ... */ }

/* 正确：整数直接比 */
if (a === b) { /* ... */ }
```

---

## 各字段的符号约定

| 字段 | 符号 | 说明 |
| ---- | ---- | ---- |
| `Account.initialBalance` | **可正可负** | 资产账户通常 ≥ 0；负债账户填负数，如 `-120000` 表示待还 1200 元 |
| `Transaction.amount` | **恒为正** | 方向由 `domain`（`expense` / `income`）决定，不要在金额上加负号 |
| `Transfer.fromAmount` | **恒为正** | 从 `fromAccountId` 流出的金额 |
| `Transfer.toAmount` | **恒为正** | 进入 `toAccountId` 的金额；同币种时等于 `fromAmount` |

> 注意：不要用「金额加负号」来表示支出。支出/收入的语义在 `domain` 字段上，
> 否则同一个字段有两种含义，汇总时必然算错。

---

## 金额与币种的绑定

**每笔金额自带币种，不要靠「金额 → 账户 → 币种」间接推导。**

| 金额字段 | 绑定的币种字段 | 校验规则（A2 持久化层负责） |
| -------- | -------------- | --------------------------- |
| `Account.initialBalance` | `Account.currency` | 同一对象，天然绑定 |
| `Transaction.amount` | `Transaction.currency` | 必须等于 `accountId` 指向账户的币种 |
| `Transfer.fromAmount` | `Transfer.fromCurrency` | 必须等于 `fromAccountId` 指向账户的币种 |
| `Transfer.toAmount` | `Transfer.toCurrency` | 必须等于 `toAccountId` 指向账户的币种 |

为什么冗余存一份 `currency`：

1. **账户改币种不追溯历史**：账户日后从 CNY 改成 USD，旧记录仍是按 CNY 存的金额，统计不会被改写；
2. **读记录无需联表**：列表页格式化金额时不必再查账户；
3. **跨币种转账可表达**：单个 `amount` 无法同时描述「转出 100 USD → 到账 730 CNY」。

> 冗余字段的唯一风险是不一致，所以**必须由 A2 的读取校验把关**，
> 类型系统管不到 localStorage 里的脏数据。

---

## 业务边界判定（收支 vs 转账）

**核心判据：看「净资产」是否变化，而不是看哪个账户的余额变了。**

`expense` / `income` 衡量的是资金进出**资产边界**（净资产变化）；
`Transfer` 衡量的是资金在**内部账户之间**的流动（净资产不变）。

| 动作 | 账户流向 | 净资产 | 当月收支 | 归属 |
| ---- | -------- | ------ | -------- | ---- |
| 资产账户消费 | 资产 → 外部 | ↓ | 计入支出 | `Transaction` expense |
| **负债账户消费** | 负债 → 外部 | ↓ | 计入支出 | `Transaction` expense |
| 收入进资产账户 | 外部 → 资产 | ↑ | 计入收入 | `Transaction` income |
| 退款回负债账户 | 外部 → 负债 | ↑ | 计入收入 | `Transaction` income |
| 资产 ↔ 资产 | 内部 | 0 | ✘ | `Transfer` `internal` |
| 资产 → 负债（还款） | 内部 | 0 | ✘ | `Transfer` `repayment` |
| 负债 → 资产（借款） | 内部 | 0 | ✘ | `Transfer` `borrowing` |
| 负债 ↔ 负债 | 内部 | 0 | ✘ | `Transfer` `liabilityInternal` |

### 为什么负债账户的消费算「支出」

```
现金付 100 元：  资产 -100 → 净资产 -100            ← 真的花了
花呗刷 100 元：  负债 -100（更负）→ 净资产 -100    ← 也花了，只是钱没动
```

两者对净资产的影响完全相同，所以都是 `expense`。
**判据是净资产，不是「资产账户余额是否减少」**——这是最容易搞错的一点。

如果按「资产账户余额是否减少」来判，花呗消费会被漏算成「什么都没发生」，
当月支出会严重低估。

### 四种转账的业务语义

`Transfer.kind` 只影响**界面文案与统计归类**，**不影响任何金额计算**：

| `kind` | 流向 | 界面可展示为 | 典型场景 |
| ------ | ---- | ------------ | -------- |
| `internal` | 资产 → 资产 | 转账 | 银行卡互转、换汇 |
| `repayment` | 资产 → 负债 | **还款** | 还花呗 / 信用卡 |
| `borrowing` | 负债 → 资产 | 借款到账 | 贷款放款、向他人借钱 |
| `liabilityInternal` | 负债 → 负债 | 调账 | 卡片间转移欠款 |

`kind` 是可选字段，缺省时用 `resolveTransferKind(fromAccount.kind, toAccount.kind)` 推断：

```ts
resolveTransferKind('asset', 'liability')      /* 'repayment' */
resolveTransferKind('liability', 'asset')      /* 'borrowing' */
resolveTransferKind('asset', 'asset')          /* 'internal' */
resolveTransferKind('liability', 'liability')  /* 'liabilityInternal' */
```

**为什么存下来而不是每次推断**：A5 做统计时必然要区分「还款」和「换卡」，
每次推断要额外查两个账户；而且用户可能想手动改语义（比如把某笔转账标记为借款）。
可选字段保证了历史数据不受影响。

---

## 账户是否必填（默认账户策略）

有些记账 App 看起来「不选账户也能记」，底层并不是真的去掉了账户，
而是**首次启动自动建一个默认账户**，用户感知不到而已。

### 本项目的选择：`accountId` 保持必填

```ts
interface Transaction {
  accountId: string   /* 非空，不允许改成 accountId?: string */
}
```

原因：

1. **币种必须从账户来**：没有账户就没有 `currency` 来源，金额单位无法确定；
2. **统计会变脏**：若允许无账户记录，「总资产」算不算它们？算则不属于任何账户，不算则总额对不上；
3. **转账无法表达**：转账必须发生在两个账户之间。

### 体验上如何做到「像不用选账户」

| 账户数 | UI 行为 |
| ------ | ------- |
| 0 | 首启动自动创建「默认账户」（CNY、资产、余额 0） |
| 1 | **跳过账户选择器**，金额直接落到唯一的账户 |
| ≥ 2 | 显示账户选择器，默认选中上次使用的账户 |

这样用户只有一个账户时完全无感，等建了第二个账户才逐渐建立账户概念。
默认账户的初始化属于 **A2 持久化层的职责**（首次读写时检测并播种）。

---

## 汇总公式（A5 会用到）

金额已经是整数最小单位，因此汇总**直接整数相加即可**，无需再换算：

```ts
/* 当月支出 = 所有 expense 记录的 amount 之和（同币种内） */
const monthExpense = transactions
  .filter((t) => t.domain === 'expense' && isSameMonth(t.date, month))
  .reduce((sum, t) => sum + t.amount, 0)

/* 账户余额 = 初始余额 + 收入 − 支出 + 转入 − 转出 */
```

**铁律**：

- `Transfer` **不参与**当月收支统计；
- 同币种 `Transfer` 在账户间一加一减，净资产不变；
- 跨币种 `Transfer` 会因汇率差异产生「折算损益」，不属于收支，单独统计。

### A2 必须校验的跨字段规则

以下约束**类型系统表达不了**，只能由持久化层在读写时校验：

| 约束 | 说明 |
| ---- | ---- |
| `Transaction.currency === account.currency` | 金额币种必须与所属账户一致 |
| `Transfer.fromCurrency === fromAccount.currency` | 同上 |
| `Transfer.toCurrency === toAccount.currency` | 同上 |
| **`fromCurrency === toCurrency` 时 `fromAmount === toAmount`** | 否则同币种转账会凭空多出/湮灭钱款 |
| `Transaction.accountId` / `fromAccountId` / `toAccountId` 必须指向存在的账户 | 防悬空引用 |
| `Category.parentId` 必须指向同 domain 的一级分类 | 分类只允许「一级 + 二级」两层 |
| `date` 必须是合法的 `YYYY-MM-DD` | 类型层无法约束日期字符串 |

---

## 多币种注意

不同币种的「最小单位」量级不同，**不能直接跨币种相加**。
账户总资产如果包含多币种，需要先按汇率折算到同一币种（如统一折 CNY）再求和。
汇率方案在 A5 阶段确定。

### 跨币种转账怎么算

`Transfer` 转出/转入两侧各自存 `amount` + `currency`，换算率由两侧反推：

```ts
transfer.fromAmount   = 10000   /* 100.00 USD（decimals = 2）*/
transfer.fromCurrency = 'USD'
transfer.toAmount     = 73000   /* 730.00 CNY（decimals = 2）*/
transfer.toCurrency   = 'CNY'

/* 隐含汇率 = 转入金额（折元） / 转出金额（折元） */
const rate = toMajor(73000, 2) / toMajor(10000, 2)   /* 7.3 */
```

注意：两侧 `decimals` 可能不同（USD 2 位、JPY 0 位），反推汇率前**必须先把两边各自按自己的 `decimals` 折成元**，
不能直接 `toAmount / fromAmount`，否则 JPY ↔ CNY 的汇率会差 100 倍。

对账户余额的影响：

- `fromAccountId` 账户余额 **减** `fromAmount`
- `toAccountId` 账户余额 **加** `toAmount`
- 两者的币种可能不同，各自按自己的币种累加即可

---

## 检查清单（写数据处理代码前对一遍）

- [ ] 金额字段是单个 `number` 整数，不是小数、不是 `{整数部分, 小数部分}`
- [ ] 元 ↔ 最小单位的换算使用了 `10 ** decimals`，没有硬编码 100
- [ ] 换算后调用了 `Math.round`，没有只挑几个数试过就认为安全
- [ ] `Transaction.amount` / `Transfer.fromAmount` / `Transfer.toAmount` 恒为正，方向靠 `domain` / 账户字段表示
- [ ] 每笔金额旁边都有对应币种，没有从账户间接推导
- [ ] 汇总时直接整数相加，没有再做一次 `×100`
- [ ] 跨币种数值没有直接相加
- [ ] 跨币种转账反推汇率前，两侧已各自按自己的 `decimals` 折成元
- [ ] 反推汇率前判断了分母不为 0
- [ ] 用户输入的金额用 `Number.isSafeInteger` 校验过，且拦截了 `NaN`
- [ ] 解析金额时小数位数是「数出来的」，没有拼动态正则（`decimals = 0` 会抛异常）
- [ ] `decimals` 是从币种查的（`getCurrency(code).decimals` 或 `getCurrencyDecimals(code)`），底层 `money.ts` 不依赖币种表
- [ ] 外部数据（localStorage / CSV）先过 `isCurrencyCode` 再交给 `getCurrency`
- [ ] `accountId` 保持必填，没有为了「懒人记账」改成可选
- [ ] 区分收支 / 转账时看**净资产是否变化**，不是看资产账户余额是否变化
- [ ] 负债账户的消费记为 `expense`，没有因为「钱没动」而漏记
- [ ] `bill.ts` 没有 import `ui.ts`，依赖方向只有 `ui.ts → bill.ts`
- [ ] 展示文案 / 图标 / 颜色 / 排序 / 分组没有写进 `bill.ts`
- [ ] 账户 + 视觉 + 币种的组合逻辑写在 `src/lib/`，没有散落在各组件里重复实现
