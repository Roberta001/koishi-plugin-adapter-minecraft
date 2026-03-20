# koishi-plugin-adapter-minecraft

基于 [mineflayer](https://github.com/PrismarineJS/mineflayer) 的 Koishi Minecraft 适配器。

本项目当前提供一个面向 Koishi 的最小可用 Minecraft 适配层，重点覆盖聊天场景：

- 接收 Minecraft 公聊消息
- 接收 Minecraft 私聊（whisper）消息
- 向 Minecraft 公聊发送消息
- 向 Minecraft 私聊发送消息
- 广播少量高价值的 `minecraft/*` Koishi 自定义事件
- 暴露原始 mineflayer bot 实例，供高级插件直接调用 mineflayer API

> 当前版本有意保持边界清晰：Koishi 层只承诺标准聊天能力与少量稳定事件；更底层的 Minecraft 专用能力通过 `bot.internal.bot` 暴露，而不是把 mineflayer 的全部事件面 1:1 映射为 Koishi 事件。

---

## 功能特性

### 标准消息桥接

- `chat` 映射为 Koishi 标准 `message` session
- `whisper` 映射为 Koishi 标准 `message` session，并带私聊语义

### 出站消息发送

- 支持向公共频道发送文本消息
- 支持向指定玩家发送私聊消息
- 对多行响应进行串行发送
- 提供发送限速，降低触发服务器反刷屏规则的风险

### 适配器事件广播

当前实现的 Koishi 自定义事件包括：

- `minecraft/ready`
- `minecraft/kicked`
- `minecraft/disconnected`
- `minecraft/player-joined`
- `minecraft/player-left`
- `minecraft/death`

### 原生 mineflayer 能力暴露

适配器会在连接期间通过 `bot.internal.bot` 暴露当前的原始 mineflayer 实例，方便高级插件直接监听或调用 mineflayer API。

为兼容早期代码，当前仍保留 `bot.client` 作为别名；新代码建议统一使用 `bot.internal.bot`。

---

## 安装

### 普通使用方式

直接通过 **Koishi 插件市场** 安装本插件即可，**不需要额外手动执行安装命令**。

### 开发者说明

如果你是在 Koishi workspace / monorepo 中直接开发本仓库，请按照 Koishi workspace 的方式为当前插件包管理依赖；对普通插件使用者来说，这一步不是必需的。

---

## 配置

```yml
plugins:
  adapter-minecraft:
    host: 127.0.0.1
    port: 25565
    username: Leafing
    auth: offline
    version: "1.21.4"
    sendInterval: 1500
    debug: true
```

### 配置项说明

| 字段 | 类型 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `host` | `string` | `127.0.0.1` | Minecraft 服务器地址 |
| `port` | `number` | `25565` | Minecraft 服务器端口 |
| `username` | `string` | - | 登录使用的玩家名或账户名 |
| `password` | `string` | - | Microsoft / Mojang 认证密码 |
| `auth` | `'offline' \| 'microsoft' \| 'mojang'` | `offline` | 登录认证方式 |
| `version` | `string` | 自动检测 | 指定 Minecraft 协议版本 |
| `sendInterval` | `number` | `1500` | 消息发送限速间隔（毫秒） |
| `debug` | `boolean` | `false` | 启用详细调试日志 |

### `sendInterval`

Minecraft 服务器通常会限制短时间内的连续聊天发送。适配器会将多行响应拆分后串行发送，并在相邻两条消息之间至少等待 `sendInterval` 毫秒，以降低触发 `disconnect.spam` 的概率。

建议值：

- `1500`：推荐默认值
- `2000 ~ 3000`：适合反刷屏更严格的服务器
- `0`：禁用限速，不建议在真实服务器中使用

### `debug`

开启后会输出更详细的运行日志，包括：

- 连接 / 登录 / spawn
- 入站公聊与私聊
- 出站消息拆分与逐行发送
- 限速等待日志
- `kicked` / `end` / `error`
- mineflayer 原始消息日志（如 `message`、`messagestr`、`unmatchedMessage`）

---

## Koishi 中的消息语义

### 公聊消息

mineflayer 的 `chat` 会映射为 Koishi 的标准 `message` session：

- `channel.type = TEXT`
- `channel.id = public:<host>:<port>`
- `guild.id = guild:<host>:<port>`

### 私聊消息

mineflayer 的 `whisper` 同样映射为 Koishi 的标准 `message` session，但带有私聊语义：

- `channel.type = DIRECT`
- `channel.id = private:<username>`
- `session.isDirect = true`

因此，在 Koishi 插件中区分 Minecraft 私聊的推荐方式是：

```ts
if (session.platform === 'minecraft' && session.isDirect) {
  // 这是 whisper 映射得到的私聊消息
}
```

---

## 自定义 Koishi 事件

除标准消息 session 外，适配器还会广播以下低频、高价值的事件。

### `minecraft/ready`

当 mineflayer 收到 `spawn`，并且机器人已真正进入世界后触发。

```ts
ctx.on('minecraft/ready', (payload) => {
  ctx.logger('minecraft').info('ready: %o', payload)
})
```

payload：

```ts
{
  serverId: string
  host: string
  port: number
  botUsername: string
  timestamp: number
  version?: string
  protocolVersion?: string
}
```

### `minecraft/kicked`

当机器人被服务器踢出时触发，对应 mineflayer 的 `kicked` 事件。

payload 额外字段：

- `reason: string`
- `loggedIn: boolean`

### `minecraft/disconnected`

当连接关闭时触发，对应 mineflayer 的 `end` 事件。

payload 额外字段：

- `reason: string`

### `minecraft/player-joined`

当其他玩家加入服务器时触发。

### `minecraft/player-left`

当其他玩家离开服务器时触发。

### `minecraft/death`

当当前机器人死亡时触发，对应 mineflayer 的 bot 级 `death` 事件。

玩家相关事件的 payload 中会额外包含：

```ts
player: {
  username: string
  uuid: string
  displayName?: string
}
```

---

## 获取原始 mineflayer bot 实例

### 推荐方式：`bot.internal.bot`

适配器会在连接期间通过 `bot.internal.bot` 暴露当前的原始 mineflayer 实例：

```ts
bot.internal.bot
```

这是推荐的高级扩展入口。

示例：

```ts
import { Context } from 'koishi'
import type { MinecraftBot } from 'koishi-plugin-adapter-minecraft'

export function apply(ctx: Context) {
  ctx.on('minecraft/ready', () => {
    const bot = ctx.bots.find((bot): bot is MinecraftBot => bot.platform === 'minecraft')
    const mineflayer = bot?.internal.bot
    if (!mineflayer) return

    mineflayer.on('chat', (username, message) => {
      ctx.logger('raw-minecraft').info('[raw chat] %s: %s', username, message)
    })
  })
}
```

### 兼容方式：`bot.client`

当前版本仍然保留：

```ts
bot.client
```

它与 `bot.internal.bot` 指向同一个实例，仅用于兼容已有代码；新代码推荐统一使用 `bot.internal.bot`。

### 使用注意事项

- `bot.internal.bot` 仅在连接建立后可用
- 断线后该字段会变为 `undefined`
- 如果发生重连，底层 mineflayer 实例可能会变化
- 更稳妥的做法是在 `minecraft/ready` 触发后重新获取一次实例

---

## 使用示例

```ts
import { Context } from 'koishi'
import type { MinecraftBot } from 'koishi-plugin-adapter-minecraft'

export function apply(ctx: Context) {
  ctx.on('minecraft/ready', (payload) => {
    ctx.logger('minecraft-demo').info('bot is ready: %o', payload)

    const bot = ctx.bots.find((bot): bot is MinecraftBot => bot.platform === 'minecraft')
    const mineflayer = bot?.internal.bot
    if (!mineflayer) return

    mineflayer.on('playerJoined', (player) => {
      ctx.logger('minecraft-demo').info('%s joined the server', player.username)
    })
  })

  ctx.on('message', (session) => {
    if (session.platform !== 'minecraft') return
    if (session.content === '#ping') {
      return 'pong'
    }
  })
}
```

---

## 设计边界

本适配器当前遵循以下边界：

- **Koishi 层**：只承诺标准聊天能力与少量 `minecraft/*` 高价值事件
- **Raw 层**：通过 `bot.internal.bot` 暴露完整 mineflayer 能力

因此：

- 不会把 mineflayer 的几十个底层事件全部提升为 Koishi 事件
- 更复杂的 Minecraft 专用逻辑应直接基于 `bot.internal.bot` 构建

这种设计可以让 Koishi 公共契约保持简洁稳定，同时保留 Minecraft 生态的扩展空间。

---

## 当前限制

当前版本只实现了最小聊天桥接，因此尚未覆盖：

- 物品栏 / 窗口操作
- 世界 / 方块 / 实体完整抽象
- 原始事件到 Koishi 的全量桥接
- 自动重连
- 更细粒度的消息元素支持

后续如需扩展，建议优先在 `bot.internal.bot` 的基础上实现 Minecraft 专用插件，再决定是否将其中少量稳定能力提升为适配器层公共接口。
