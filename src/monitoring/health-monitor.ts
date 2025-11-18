/**
 * Health Monitoring Service
 *
 * Periodically checks the health of the CAHTS system and sends Discord notifications
 * when issues are detected or when services recover.
 */

interface ServiceHealth {
  status: 'healthy' | 'unhealthy' | 'degraded'
  message?: string
  responseTime?: number
}

interface HealthCheckResponse {
  status: 'healthy' | 'unhealthy' | 'degraded'
  timestamp: string
  services: {
    database: ServiceHealth
    whisper: ServiceHealth
    qwen: ServiceHealth
  }
  uptime: number
}

interface ServiceState {
  consecutiveFailures: number
  lastStatus: 'healthy' | 'unhealthy' | 'degraded' | 'unknown'
  notificationSent: boolean
  lastNotificationTime?: Date
}

class HealthMonitor {
  private appUrl: string
  private discordWebhookUrl: string
  private checkInterval: number
  private timeoutSeconds: number
  private failureThreshold: number

  private serviceStates: Map<string, ServiceState> = new Map()
  private overallState: ServiceState = {
    consecutiveFailures: 0,
    lastStatus: 'unknown',
    notificationSent: false,
  }

  constructor() {
    this.appUrl = process.env.APP_URL || 'http://app:3000'
    this.discordWebhookUrl = process.env.HEALTH_DISCORD_WEBHOOK_URL || process.env.DEFAULT_DISCORD_WEBHOOK_URL || ''
    this.checkInterval = parseInt(process.env.HEALTH_CHECK_INTERVAL_SECONDS || '60') * 1000
    this.timeoutSeconds = parseInt(process.env.HEALTH_CHECK_TIMEOUT_SECONDS || '10')
    this.failureThreshold = parseInt(process.env.HEALTH_CHECK_FAILURE_THRESHOLD || '3')

    // Initialize service states
    this.serviceStates.set('database', {
      consecutiveFailures: 0,
      lastStatus: 'unknown',
      notificationSent: false,
    })
    this.serviceStates.set('whisper', {
      consecutiveFailures: 0,
      lastStatus: 'unknown',
      notificationSent: false,
    })
    this.serviceStates.set('qwen', {
      consecutiveFailures: 0,
      lastStatus: 'unknown',
      notificationSent: false,
    })

    if (!this.discordWebhookUrl) {
      console.warn('⚠️  No Discord webhook URL configured. Notifications will be logged only.')
    }
  }

  /**
   * Send a Discord notification
   */
  private async sendDiscordNotification(
    title: string,
    description: string,
    color: number,
    fields?: { name: string; value: string; inline?: boolean }[]
  ): Promise<void> {
    if (!this.discordWebhookUrl) {
      console.log(`[Discord] ${title}: ${description}`)
      return
    }

    try {
      const embed = {
        title,
        description,
        color,
        timestamp: new Date().toISOString(),
        fields: fields || [],
      }

      const response = await fetch(this.discordWebhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ embeds: [embed] }),
      })

      if (!response.ok) {
        console.error(`Failed to send Discord notification: ${response.statusText}`)
      }
    } catch (error) {
      console.error('Error sending Discord notification:', error)
    }
  }

  /**
   * Perform health check
   */
  private async performHealthCheck(): Promise<HealthCheckResponse | null> {
    try {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), this.timeoutSeconds * 1000)

      const response = await fetch(`${this.appUrl}/api/health/detailed`, {
        signal: controller.signal,
      })

      clearTimeout(timeout)

      if (!response.ok) {
        console.error(`Health check returned status ${response.status}`)
        return null
      }

      return await response.json()
    } catch (error) {
      console.error('Health check failed:', error)
      return null
    }
  }

  /**
   * Process health check results and send notifications
   */
  private async processHealthCheck(health: HealthCheckResponse | null): Promise<void> {
    const timestamp = new Date().toISOString()

    // If health check completely failed
    if (!health) {
      this.overallState.consecutiveFailures++

      if (
        this.overallState.consecutiveFailures >= this.failureThreshold &&
        !this.overallState.notificationSent
      ) {
        await this.sendDiscordNotification(
          '🔴 CAHTS System Unreachable',
          `The CAHTS application is not responding to health checks.\n\nConsecutive failures: ${this.overallState.consecutiveFailures}`,
          0xff0000, // Red
          [
            { name: 'App URL', value: this.appUrl, inline: true },
            { name: 'Time', value: timestamp, inline: true },
          ]
        )
        this.overallState.notificationSent = true
        this.overallState.lastNotificationTime = new Date()
      }

      console.log(`❌ [${timestamp}] Health check failed (${this.overallState.consecutiveFailures} consecutive failures)`)
      return
    }

    // If system recovered
    if (this.overallState.notificationSent && health.status === 'healthy') {
      await this.sendDiscordNotification(
        '✅ CAHTS System Recovered',
        'The CAHTS application is now responding to health checks.',
        0x00ff00, // Green
        [
          { name: 'Uptime', value: `${Math.floor(health.uptime / 60)} minutes`, inline: true },
          { name: 'Time', value: timestamp, inline: true },
        ]
      )
      this.overallState.notificationSent = false
      this.overallState.consecutiveFailures = 0
    }

    // Check individual services
    for (const [serviceName, serviceHealth] of Object.entries(health.services)) {
      const state = this.serviceStates.get(serviceName)!

      if (serviceHealth.status === 'unhealthy') {
        state.consecutiveFailures++

        if (
          state.consecutiveFailures >= this.failureThreshold &&
          !state.notificationSent
        ) {
          await this.sendDiscordNotification(
            `🔴 ${serviceName.toUpperCase()} Service Unhealthy`,
            `The ${serviceName} service is experiencing issues.\n\n${serviceHealth.message || 'No details available'}`,
            0xff0000, // Red
            [
              { name: 'Consecutive Failures', value: state.consecutiveFailures.toString(), inline: true },
              { name: 'Response Time', value: serviceHealth.responseTime ? `${serviceHealth.responseTime}ms` : 'N/A', inline: true },
              { name: 'Time', value: timestamp, inline: true },
            ]
          )
          state.notificationSent = true
          state.lastNotificationTime = new Date()
        }
      } else if (serviceHealth.status === 'degraded') {
        // Log degraded status but don't send notification unless it persists
        if (state.lastStatus === 'healthy') {
          console.log(`⚠️  [${timestamp}] ${serviceName} service degraded: ${serviceHealth.message}`)
        }
        state.consecutiveFailures = 0
      } else {
        // Service is healthy
        if (state.notificationSent) {
          await this.sendDiscordNotification(
            `✅ ${serviceName.toUpperCase()} Service Recovered`,
            `The ${serviceName} service has recovered.`,
            0x00ff00, // Green
            [
              { name: 'Response Time', value: serviceHealth.responseTime ? `${serviceHealth.responseTime}ms` : 'N/A', inline: true },
              { name: 'Time', value: timestamp, inline: true },
            ]
          )
          state.notificationSent = false
        }
        state.consecutiveFailures = 0
      }

      state.lastStatus = serviceHealth.status
    }

    // Log overall status
    const statusEmoji = health.status === 'healthy' ? '✅' : health.status === 'degraded' ? '⚠️' : '❌'
    console.log(`${statusEmoji} [${timestamp}] Overall: ${health.status} | DB: ${health.services.database.status} (${health.services.database.responseTime}ms) | Whisper: ${health.services.whisper.status} | Qwen: ${health.services.qwen.status}`)
  }

  /**
   * Start monitoring
   */
  public async start(): Promise<void> {
    console.log('🏥 Health Monitor starting...')
    console.log(`   App URL: ${this.appUrl}`)
    console.log(`   Check interval: ${this.checkInterval / 1000}s`)
    console.log(`   Failure threshold: ${this.failureThreshold}`)
    console.log(`   Discord notifications: ${this.discordWebhookUrl ? 'enabled' : 'disabled'}`)
    console.log('')

    // Send startup notification
    if (this.discordWebhookUrl) {
      await this.sendDiscordNotification(
        '🏥 Health Monitor Started',
        'The CAHTS health monitoring service has started.',
        0x0099ff, // Blue
        [
          { name: 'Check Interval', value: `${this.checkInterval / 1000}s`, inline: true },
          { name: 'Failure Threshold', value: this.failureThreshold.toString(), inline: true },
        ]
      )
    }

    // Perform initial health check
    const initialHealth = await this.performHealthCheck()
    await this.processHealthCheck(initialHealth)

    // Start periodic checks
    setInterval(async () => {
      const health = await this.performHealthCheck()
      await this.processHealthCheck(health)
    }, this.checkInterval)
  }
}

// Start the monitor
const monitor = new HealthMonitor()
monitor.start().catch((error) => {
  console.error('Failed to start health monitor:', error)
  process.exit(1)
})
