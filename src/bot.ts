import { Bot, Context, h, Universal } from 'koishi'
import type { Bot as MineflayerClient } from 'mineflayer'
import { MinecraftAdapter } from './adapter'
import { MinecraftMessageEncoder } from './message'
import type { Config } from './index'

function serverKey(config: Config) {
  return `${config.host}:${config.port}`
}

function previewText(content: string, maxLength = 120) {
  if (content.length <= maxLength) return content
  return `${content.slice(0, maxLength)}…`
}

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms))
}

export class MinecraftBot extends Bot<Context, Config> {
  static MessageEncoder = MinecraftMessageEncoder

  public client?: MineflayerClient
  public readonly publicGuildId: string
  public readonly publicChannelId: string
  private sendQueue = Promise.resolve()
  private lastSentAt = 0

  constructor(ctx: Context, config: Config) {
    super(ctx, config, 'minecraft')
    const serverId = serverKey(config)
    this.user = { id: config.username, name: config.username }
    this.publicGuildId = `guild:${serverId}`
    this.publicChannelId = `public:${serverId}`
    this.adapter = new MinecraftAdapter<this>(ctx)
    this.adapter.bots.push(this)
  }

  receivePublicMessage(username: string, content: string) {
    if (this.config.debug) {
      this.logger.debug(
        '[recv:public] from=%s channel=%s chars=%d content=%s',
        username,
        this.publicChannelId,
        content.length,
        previewText(content),
      )
    }

    const session = this.session({
      type: 'message',
      user: { id: username, name: username },
      channel: { id: this.publicChannelId, type: Universal.Channel.Type.TEXT },
      guild: { id: this.publicGuildId, name: this.publicGuildId },
      message: {
        id: `public:${Date.now()}:${username}`,
        content,
        elements: [h.text(content)],
      },
    })

    if (this.config.debug) {
      this.logger.debug('[dispatch:public] user=%s sessionId=%s', username, session.id)
    }
    this.dispatch(session)
  }

  receivePrivateMessage(username: string, content: string) {
    if (this.config.debug) {
      this.logger.debug(
        '[recv:private] from=%s channel=%s chars=%d content=%s',
        username,
        `private:${username}`,
        content.length,
        previewText(content),
      )
    }

    const session = this.session({
      type: 'message',
      user: { id: username, name: username },
      channel: { id: `private:${username}`, type: Universal.Channel.Type.DIRECT },
      message: {
        id: `private:${Date.now()}:${username}`,
        content,
        elements: [h.text(content)],
      },
    })
    session.isDirect = true

    if (this.config.debug) {
      this.logger.debug('[dispatch:private] user=%s sessionId=%s', username, session.id)
    }
    this.dispatch(session)
  }

  async createDirectChannel(userId: string) {
    return {
      id: `private:${userId}`,
      type: Universal.Channel.Type.DIRECT,
    }
  }

  async sendQueuedMessage(channelId: string, content: string) {
    await this.withSendQueue(async () => {
      const wait = Math.max(0, this.lastSentAt + this.config.sendInterval - Date.now())
      if (wait > 0) {
        this.logger.info('[send:throttle] waiting=%dms channel=%s', wait, channelId)
        await sleep(wait)
      }

      const client = this.client
      if (!client) {
        this.logger.error('[send] client missing while sending queued message to channel=%s', channelId)
        throw new Error('minecraft client is not connected')
      }

      if (channelId.startsWith('private:')) {
        const username = channelId.slice('private:'.length)
        client.whisper(username, content)
      } else {
        client.chat(content)
      }

      this.lastSentAt = Date.now()
    })
  }

  private async withSendQueue<T>(callback: () => Promise<T>) {
    const previous = this.sendQueue
    let resolveCurrent!: () => void
    this.sendQueue = new Promise<void>((resolve) => {
      resolveCurrent = resolve
    })

    await previous

    try {
      return await callback()
    } finally {
      resolveCurrent()
    }
  }
}
