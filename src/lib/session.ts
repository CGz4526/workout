// 训练记录的写入门槛。

// 少于 1 分钟的训练视为误触或试手，不写入记录。
export const MIN_SESSION_SECONDS = 60

/**
 * 是否短到不该留记录。
 *
 * duration 为 0 表示「时长未知」——手动补录时用户可能根本不记得练了多久，
 * 这种记录是合法的，不能拿 0 去和门槛比。
 * 只有「明确记录了时长、但不足 1 分钟」才拦。
 */
export const isTooShortToRecord = (seconds: number) =>
  Number.isFinite(seconds) && seconds > 0 && seconds < MIN_SESSION_SECONDS
