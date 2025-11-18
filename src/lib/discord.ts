export interface DiscordEmbed {
  title: string
  description?: string
  color: number
  fields?: Array<{
    name: string
    value: string
    inline?: boolean
  }>
  footer?: {
    text: string
  }
  timestamp?: string
}

export interface DiscordWebhookPayload {
  username?: string
  avatar_url?: string
  content?: string
  embeds?: DiscordEmbed[]
}

export class DiscordService {
  private defaultWebhookUrl: string | null

  constructor(webhookUrl?: string) {
    this.defaultWebhookUrl = webhookUrl || process.env.DEFAULT_DISCORD_WEBHOOK_URL || null
  }

  /**
   * Send notification to Discord webhook
   */
  async sendNotification(
    payload: DiscordWebhookPayload,
    webhookUrl?: string
  ): Promise<boolean> {
    const url = webhookUrl || this.defaultWebhookUrl

    if (!url) {
      console.warn('No Discord webhook URL configured')
      return false
    }

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      })

      if (!response.ok) {
        // Handle rate limiting
        if (response.status === 429) {
          const retryAfter = response.headers.get('Retry-After')
          console.warn(`Discord rate limited. Retry after: ${retryAfter}s`)
        }
        throw new Error(`Discord webhook error: ${response.status}`)
      }

      return true
    } catch (error) {
      console.error('Discord notification error:', error)
      return false
    }
  }

  /**
   * Send job completion notification
   */
  async notifyJobCompleted(
    jobId: string,
    fileName: string,
    processingTime: number,
    correctionsCount: number,
    webhookUrl?: string
  ): Promise<boolean> {
    const embed: DiscordEmbed = {
      title: '✅ Transcription Completed',
      description: `Job **${jobId}** has been successfully processed`,
      color: 0x00ff00, // Green
      fields: [
        {
          name: 'File',
          value: fileName,
          inline: true,
        },
        {
          name: 'Processing Time',
          value: `${(processingTime / 1000).toFixed(2)}s`,
          inline: true,
        },
        {
          name: 'Corrections Applied',
          value: correctionsCount.toString(),
          inline: true,
        },
      ],
      footer: {
        text: 'Processed by CAHTS v1.0',
      },
      timestamp: new Date().toISOString(),
    }

    return this.sendNotification(
      {
        username: 'TranscriptionBot',
        embeds: [embed],
      },
      webhookUrl
    )
  }

  /**
   * Send job failure notification
   */
  async notifyJobFailed(
    jobId: string,
    fileName: string,
    errorMessage: string,
    webhookUrl?: string
  ): Promise<boolean> {
    const embed: DiscordEmbed = {
      title: '❌ Transcription Failed',
      description: `Job **${jobId}** encountered an error`,
      color: 0xff0000, // Red
      fields: [
        {
          name: 'File',
          value: fileName,
          inline: false,
        },
        {
          name: 'Error',
          value: errorMessage.substring(0, 1000), // Limit error message length
          inline: false,
        },
      ],
      footer: {
        text: 'Processed by CAHTS v1.0',
      },
      timestamp: new Date().toISOString(),
    }

    return this.sendNotification(
      {
        username: 'TranscriptionBot',
        embeds: [embed],
      },
      webhookUrl
    )
  }

  /**
   * Send job started notification
   */
  async notifyJobStarted(
    jobId: string,
    fileName: string,
    webhookUrl?: string
  ): Promise<boolean> {
    const embed: DiscordEmbed = {
      title: '🔄 Transcription Started',
      description: `Processing job **${jobId}**`,
      color: 0x0099ff, // Blue
      fields: [
        {
          name: 'File',
          value: fileName,
          inline: false,
        },
      ],
      footer: {
        text: 'Processed by CAHTS v1.0',
      },
      timestamp: new Date().toISOString(),
    }

    return this.sendNotification(
      {
        username: 'TranscriptionBot',
        embeds: [embed],
      },
      webhookUrl
    )
  }
}

export const discordService = new DiscordService()
