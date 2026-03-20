import { Adapter, Context } from 'koishi'
import { createBot, type Bot as MineflayerClient } from 'mineflayer'
import type { MinecraftBot } from './bot'

function previewText(content: string, maxLength = 120) {
  if (content.length <= maxLength) return content
  return `${content.slice(0, maxLength)}…`
}

function stringifyReason(reason: unknown) {
  if (typeof reason === 'string') return reason
  if (reason == null) return 'unknown'
  try {
    return JSON.stringify(reason)
  } catch {
    return String(reason)
  }
}

export class MinecraftAdapter<B extends MinecraftBot = MinecraftBot> extends Adapter<Context, B> {
  private client?: MineflayerClient

  async connect(bot: B) {
    const { host, port, username, password, auth, version } = bot.config
    bot.logger.info('[connect] creating mineflayer client -> %s:%d as %s (auth=%s, version=%s)', host, port, username, auth, version || 'auto')

    const client = createBot({
      host,
      port,
      username,
      password,
      auth,
      version,
    })

    this.client = client
    bot.client = client

    client.on('login', () => {
      bot.logger.info(
        '[login] authenticated as %s (serverVersion=%s, protocol=%s)',
        client.username,
        client.version,
        client.protocolVersion,
      )
    })

    client.once('spawn', () => {
      bot.logger.info('[spawn] bot spawned successfully as %s', client.username)
      bot.online()
    })

    client.on('chat', (username, message) => {
      if (username === client.username) {
        if (bot.config.debug) {
          bot.logger.debug('[chat:self-filtered] content=%s', previewText(message))
        }
        return
      }
      bot.receivePublicMessage(username, message)
    })

    client.on('whisper', (username, message) => {
      if (username === client.username) {
        if (bot.config.debug) {
          bot.logger.debug('[whisper:self-filtered] content=%s', previewText(message))
        }
        return
      }
      bot.receivePrivateMessage(username, message)
    })

    client.on('kicked', (reason, loggedIn) => {
      bot.logger.warn('[kicked] loggedIn=%s reason=%s', loggedIn, stringifyReason(reason))
    })

    client.on('end', (reason) => {
      bot.logger.warn('[end] connection closed, reason=%s', stringifyReason(reason))
      bot.offline()
    })

    client.on('error', (error) => {
      bot.logger.warn('[error] %s', error?.stack || error?.message || String(error))
    })

    if (bot.config.debug) {
      client.on('messagestr', (message, position) => {
        bot.logger.debug('[messagestr:%s] %s', position, previewText(message, 200))
      })

      client.on('message', (jsonMessage) => {
        bot.logger.debug('[message] %s', previewText(jsonMessage.toString(), 200))
      })

      client.on('unmatchedMessage', (message) => {
        bot.logger.debug('[unmatched-message] %s', previewText(message, 200))
      })
    }
  }

  async disconnect(bot: B) {
    const client = this.client
    this.client = undefined
    bot.client = undefined
    if (!client) {
      bot.logger.info('[disconnect] skipped because client is already missing')
      return
    }

    bot.logger.info('[disconnect] disposing mineflayer client for %s', client.username || bot.config.username)
    client.removeAllListeners()
    client.end()
    bot.logger.info('[disconnect] mineflayer end() called')
    bot.offline()
  }
}
