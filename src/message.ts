import { Context, h, MessageEncoder, type Universal } from 'koishi'
import type { MinecraftBot } from './bot'

let syntheticMessageId = 0

function nextSyntheticMessageId() {
  syntheticMessageId += 1
  return `minecraft:${syntheticMessageId}`
}

function previewText(content: string, maxLength = 120) {
  if (content.length <= maxLength) return content
  return `${content.slice(0, maxLength)}…`
}

function stringifyElement(element: h): string {
  if (element.type === 'text') return element.attrs.content || ''
  if (element.type === 'br') return '\n'

  let result = ''
  for (const child of element.children || []) {
    if (typeof child === 'string') {
      result += child
    } else {
      result += stringifyElement(child)
    }
  }
  return result
}

function toSyntheticMessage(id: string, channelId: string, content: string): Universal.Message {
  return {
    id,
    content,
    elements: [h.text(content)],
    channel: {
      id: channelId,
      type: channelId.startsWith('private:') ? 1 : 0,
    },
  }
}

export class MinecraftMessageEncoder extends MessageEncoder<Context, MinecraftBot> {
  static fallback = true

  private buffer = ''

  async visit(element: h) {
    this.buffer += stringifyElement(element)
  }

  async flush() {
    const content = this.buffer
    this.buffer = ''
    if (!content) {
      if (this.bot.config.debug) {
        this.bot.logger.debug('[send] skipped empty buffer for channel=%s', this.channelId)
      }
      return
    }

    const lines = content.split(/\r?\n/).filter(line => line.length > 0)
    if (!lines.length) {
      this.bot.logger.warn('[send] content became empty after split for channel=%s', this.channelId)
      return
    }

    const isPrivate = this.channelId.startsWith('private:')
    this.bot.logger.info(
      '[send] mode=%s channel=%s lines=%d chars=%d interval=%dms',
      isPrivate ? 'private' : 'public',
      this.channelId,
      lines.length,
      content.length,
      this.bot.config.sendInterval,
    )
    if (lines.length > 3) {
      this.bot.logger.warn('[send] response split into %d lines; this may trigger server spam/kick rules', lines.length)
    }

    const messageIds: string[] = []
    for (let index = 0; index < lines.length; index++) {
      const line = lines[index]
      if (this.bot.config.debug) {
        this.bot.logger.debug('[send:line %d/%d] %s', index + 1, lines.length, previewText(line, 200))
      }

      await this.bot.sendQueuedMessage(this.session.channelId, line)
      messageIds.push(nextSyntheticMessageId())
    }

    this.results.push(...messageIds.map(id => toSyntheticMessage(id, this.channelId, lines.join('\n'))))
  }
}
