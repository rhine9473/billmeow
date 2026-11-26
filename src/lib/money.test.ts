import { describe, expect, it } from 'vitest'
import {
  formatMinor,
  formatMoney,
  parseAmount,
  parseAmountForCurrency,
  toMajor,
  toMinor,
} from './money'

describe('toMinor', () => {
  it('按小数位数换算为整数最小单位', () => {
    expect(toMinor(12.34, 2)).toBe(1234)
    expect(toMinor(0.05, 2)).toBe(5)
    expect(toMinor(0, 2)).toBe(0)
  })

  it('对浮点脏值四舍五入，不截断', () => {
    /* 浮点乘法带尾巴：28.999999999999996 / 434.99999999999994 / 855.0000000000001 */
    expect(toMinor(0.29, 2)).toBe(29)
    expect(toMinor(4.35, 2)).toBe(435)
    expect(toMinor(8.55, 2)).toBe(855)
  })

  it('输入本身已失真的值按浮点实际结果处理', () => {
    /* 1.005 在二进制浮点里是 1.00499999999999989…，乘 100 得 100.4999…，属已知行为 */
    expect(toMinor(1.005, 2)).toBe(100)
  })

  it('无小数位币种保持原值', () => {
    expect(toMinor(314, 0)).toBe(314)
  })
})

describe('toMajor', () => {
  it('把整数最小单位换算回元', () => {
    expect(toMajor(855, 2)).toBe(8.55)
    expect(toMajor(5, 2)).toBe(0.05)
    expect(toMajor(314, 0)).toBe(314)
  })

  it('负数换算保持符号', () => {
    expect(toMinor(-8.55, 2)).toBe(-855)
    expect(toMajor(-855, 2)).toBe(-8.55)
  })
})

describe('parseAmount', () => {
  it('解析合法金额', () => {
    expect(parseAmount('12.34', 2)).toBe(1234)
    expect(parseAmount('0.05', 2)).toBe(5)
    expect(parseAmount('0.5', 2)).toBe(50)
    expect(parseAmount('25', 2)).toBe(2500)
    expect(parseAmount('0', 2)).toBe(0)
    expect(parseAmount(' 12.34 ', 2)).toBe(1234)
  })

  it('对浮点脏值同样四舍五入，与 toMinor 保持一致', () => {
    /* parseAmount 内部同样有 round：28.999999999999996 / 434.99999999999994 / 855.0000000000001 */
    expect(parseAmount('0.29', 2)).toBe(29)
    expect(parseAmount('4.35', 2)).toBe(435)
    expect(parseAmount('8.55', 2)).toBe(855)
  })

  it('小数位超限直接拒绝，不静默截断', () => {
    expect(parseAmount('1.005', 2)).toBeNull()
    expect(parseAmount('1.5', 0)).toBeNull()
    /* 末位是 0 也要计入小数位，不因"数值上等于 12.34"而宽松放行 */
    expect(parseAmount('12.340', 2)).toBeNull()
  })

  it('无小数位币种解析整数金额', () => {
    expect(parseAmount('1005', 0)).toBe(1005)
  })

  it('拒绝非十进制格式的输入', () => {
    expect(parseAmount('abc', 2)).toBeNull()
    expect(parseAmount('', 2)).toBeNull()
    expect(parseAmount('.5', 2)).toBeNull()
    expect(parseAmount('5.', 2)).toBeNull()
    expect(parseAmount('1e5', 2)).toBeNull()
    expect(parseAmount('1,234.56', 2)).toBeNull()
    expect(parseAmount('+12.34', 2)).toBeNull()
  })

  it('拒绝负号（方向由业务字段表达）', () => {
    expect(parseAmount('-3.5', 2)).toBeNull()
  })

  it('拒绝超出安全整数范围的金额', () => {
    expect(parseAmount('99999999999999999', 2)).toBeNull()
    /* 边界三连：上限内逐分精确（浮点乘法写法会在 .90 处差 1 分），再多一分拒绝 */
    expect(parseAmount('90071992547409.90', 2)).toBe(9007199254740990)
    expect(parseAmount('90071992547409.91', 2)).toBe(9007199254740991)
    expect(parseAmount('90071992547409.92', 2)).toBeNull()
  })
})

describe('formatMinor', () => {
  it('输出两位小数并加千分位', () => {
    expect(formatMinor(123456, 2)).toBe('1,234.56')
    expect(formatMinor(123456789, 2)).toBe('1,234,567.89')
    expect(formatMinor(5, 2)).toBe('0.05')
    expect(formatMinor(0, 2)).toBe('0.00')
    /* 最大安全整数附近仍精确：守纯整数拆分的实现（换 toFixed 会差 1 分） */
    expect(formatMinor(9007199254740990, 2)).toBe('90,071,992,547,409.90')
  })

  it('无小数位币种不输出小数点', () => {
    expect(formatMinor(1234, 0)).toBe('1,234')
  })

  it('负金额保留符号（账户余额、净资产可为负）', () => {
    expect(formatMinor(-123456, 2)).toBe('-1,234.56')
    expect(formatMinor(-1234, 0)).toBe('-1,234')
    /* 跨零边界：整数部分为 0 时符号与小数位都要保留 */
    expect(formatMinor(-5, 2)).toBe('-0.05')
  })
})

describe('parseAmountForCurrency', () => {
  it('按币种小数位解析', () => {
    expect(parseAmountForCurrency('12.34', 'CNY')).toBe(1234)
    expect(parseAmountForCurrency('1005', 'JPY')).toBe(1005)
    expect(parseAmountForCurrency('1.5', 'JPY')).toBeNull()
  })
})

describe('formatMoney', () => {
  it('按币种符号与小数位格式化', () => {
    expect(formatMoney(123456, 'CNY')).toBe('¥1,234.56')
    expect(formatMoney(123456, 'USD')).toBe('$1,234.56')
    expect(formatMoney(1234, 'JPY')).toBe('¥1,234')
    expect(formatMoney(1234, 'KRW')).toBe('₩1,234')
  })

  it('负金额的负号放在货币符号之前', () => {
    expect(formatMoney(-123456, 'CNY')).toBe('-¥1,234.56')
    expect(formatMoney(-5, 'CNY')).toBe('-¥0.05')
  })

  it('CNY 与 JPY 符号相同但小数位不同', () => {
    expect(formatMoney(100, 'CNY')).toBe('¥1.00')
    expect(formatMoney(100, 'JPY')).toBe('¥100')
  })
})

describe('任意小数位（如 3 位币种）', () => {
  it('按传入的 decimals 工作，不特判 0 和 2', () => {
    /* README 提到 KWD 是 3 位币种（1 第纳尔 = 1000 fils），纯数学层应天然支持 */
    expect(parseAmount('3.140', 3)).toBe(3140)
    expect(parseAmount('3.1405', 3)).toBeNull()
    expect(toMinor(3.145, 3)).toBe(3145)
    expect(toMajor(3145, 3)).toBe(3.145)
    expect(formatMinor(3140, 3)).toBe('3.140')
    expect(formatMinor(5, 3)).toBe('0.005')
    /* 4 位：千分位正则只作用于整数段，不会误伤更长的 Fraction 段 */
    expect(formatMinor(12345, 4)).toBe('1.2345')
  })
})

describe('整数最小单位的精度', () => {
  it('0.1 + 0.2 不再出现浮点误差', () => {
    const a = parseAmount('0.1', 2)!
    const b = parseAmount('0.2', 2)!

    expect(a + b).toBe(30)
    expect(formatMoney(a + b, 'CNY')).toBe('¥0.30')
  })

  it('0.1 元累加 10 次恰好 1 元', () => {
    let sum = 0
    for (let i = 0; i < 10; i++) sum += parseAmount('0.1', 2)!

    expect(sum).toBe(100)
    expect(formatMinor(sum, 2)).toBe('1.00')
  })

  it('toMinor 与 toMajor 在输入小数位不超过 decimals 时可精确往返', () => {
    for (const value of [0.01, 8.55, 12.34, 999.99]) {
      expect(toMajor(toMinor(value, 2), 2)).toBe(value)
    }
  })
})