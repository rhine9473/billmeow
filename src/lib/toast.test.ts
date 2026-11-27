import { afterEach, describe, expect, it, vi } from 'vitest'
import { notify, onToast, pushToast } from './toast'

describe('toast', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('订阅后可收到推送的提示', () => {
    const listener = vi.fn()
    const off = onToast(listener)

    pushToast('error', '保存失败')

    expect(listener).toHaveBeenCalledTimes(1)
    expect(listener.mock.calls[0][0]).toMatchObject({ kind: 'error', message: '保存失败' })
    off()
  })

  it('取消订阅后不再收到提示', () => {
    const listener = vi.fn()
    const off = onToast(listener)
    off()

    pushToast('info', '已保存')

    expect(listener).not.toHaveBeenCalled()
  })

  it('每条提示的 id 唯一且递增', () => {
    const ids: number[] = []
    const off = onToast((item) => ids.push(item.id))

    pushToast('info', 'a')
    pushToast('info', 'b')

    expect(ids).toHaveLength(2)
    expect(ids[0]).not.toBe(ids[1])
    off()
  })

  it('错误提示的默认停留时间长于普通提示', () => {
    const durations: number[] = []
    const off = onToast((item) => durations.push(item.duration))

    notify.error('坏了')
    notify.info('普通信息')

    expect(durations[0]).toBeGreaterThan(durations[1])
    off()
  })

  it('可显式指定停留时长', () => {
    const listener = vi.fn()
    const off = onToast(listener)

    notify.success('完成', 1000)

    expect(listener.mock.calls[0][0]).toMatchObject({ duration: 1000 })
    off()
  })

  it('没有订阅者时不静默丢弃，而是输出日志', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    pushToast('error', '无人接收')

    expect(warn).toHaveBeenCalledWith(expect.stringContaining('无人接收'))
  })

  it('多个订阅者都能收到同一条提示', () => {
    const a = vi.fn()
    const b = vi.fn()
    const offA = onToast(a)
    const offB = onToast(b)

    pushToast('info', '广播')

    expect(a).toHaveBeenCalledTimes(1)
    expect(b).toHaveBeenCalledTimes(1)
    offA()
    offB()
  })
})
