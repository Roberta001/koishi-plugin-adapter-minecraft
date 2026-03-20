import { Context, Schema } from 'koishi'
import { MinecraftBot } from './bot'
export { MinecraftBot }
export type { MinecraftInternal } from './bot'

export const name = 'adapter-minecraft'

export interface MinecraftEventBase {
  serverId: string
  host: string
  port: number
  botUsername: string
  timestamp: number
}

export interface MinecraftReadyEvent extends MinecraftEventBase {
  version?: string
  protocolVersion?: string
}

export interface MinecraftKickedEvent extends MinecraftEventBase {
  reason: string
  loggedIn: boolean
}

export interface MinecraftDisconnectedEvent extends MinecraftEventBase {
  reason: string
}

export interface MinecraftPlayerEvent extends MinecraftEventBase {
  player: {
    username: string
    uuid: string
    displayName?: string
  }
}

export interface MinecraftDeathEvent extends MinecraftEventBase {}

declare module 'koishi' {
  interface Events {
    'minecraft/ready'(payload: MinecraftReadyEvent): void
    'minecraft/kicked'(payload: MinecraftKickedEvent): void
    'minecraft/disconnected'(payload: MinecraftDisconnectedEvent): void
    'minecraft/player-joined'(payload: MinecraftPlayerEvent): void
    'minecraft/player-left'(payload: MinecraftPlayerEvent): void
    'minecraft/death'(payload: MinecraftDeathEvent): void
  }
}

export interface Config {
  host: string
  port: number
  username: string
  password?: string
  auth: 'offline' | 'microsoft' | 'mojang'
  version?: string
  sendInterval: number
  debug: boolean
}

export const Config: Schema<Config> = Schema.object({
  host: Schema.string().default('127.0.0.1').description('Minecraft 服务器地址。'),
  port: Schema.number().default(25565).description('Minecraft 服务器端口。'),
  username: Schema.string().required().description('登录使用的玩家名或账户名。'),
  password: Schema.string().role('secret').description('微软 / Mojang 认证密码。'),
  auth: Schema.union([
    Schema.const('offline').description('离线登录'),
    Schema.const('microsoft').description('微软账号'),
    Schema.const('mojang').description('Mojang 账号'),
  ]).default('offline').description('登录认证方式。'),
  version: Schema.string().description('指定 Minecraft 协议版本，留空自动检测。'),
  sendInterval: Schema.number().role('ms').min(0).default(1500).description('消息发送限速间隔（毫秒）。机器人会串行发送多行回复，避免因刷屏被踢出。设为 0 表示禁用限速。'),
  debug: Schema.boolean().default(false).description('启用详细调试日志，包括连接、收发消息、断线原因与 mineflayer 原始消息。'),
})

export function apply(ctx: Context, config: Config) {
  ctx.logger(name).info(
    '[init] loading adapter for %s:%d as %s (auth=%s, version=%s, sendInterval=%dms, debug=%s)',
    config.host,
    config.port,
    config.username,
    config.auth,
    config.version || 'auto',
    config.sendInterval,
    config.debug,
  )
  ctx.plugin(MinecraftBot, config)
}
