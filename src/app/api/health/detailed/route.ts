import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

interface ServiceHealth {
  status: 'healthy' | 'unhealthy' | 'degraded'
  message?: string
  responseTime?: number
}

interface DetailedHealthResponse {
  status: 'healthy' | 'unhealthy' | 'degraded'
  timestamp: string
  services: {
    database: ServiceHealth
    whisper: ServiceHealth
    qwen: ServiceHealth
  }
  uptime: number
}

/**
 * Check database connectivity
 */
async function checkDatabase(): Promise<ServiceHealth> {
  const start = Date.now()
  try {
    await prisma.$queryRaw`SELECT 1`
    return {
      status: 'healthy',
      responseTime: Date.now() - start,
    }
  } catch (error) {
    return {
      status: 'unhealthy',
      message: error instanceof Error ? error.message : 'Database connection failed',
      responseTime: Date.now() - start,
    }
  }
}

/**
 * Check Whisper API availability
 */
async function checkWhisper(): Promise<ServiceHealth> {
  const start = Date.now()
  const whisperUrl = process.env.WHISPER_API_URL

  if (!whisperUrl) {
    return {
      status: 'unhealthy',
      message: 'WHISPER_API_URL not configured',
    }
  }

  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 5000)

    const response = await fetch(`${whisperUrl}/health`, {
      signal: controller.signal,
    })

    clearTimeout(timeout)

    if (response.ok) {
      return {
        status: 'healthy',
        responseTime: Date.now() - start,
      }
    } else {
      return {
        status: 'degraded',
        message: `Whisper API returned status ${response.status}`,
        responseTime: Date.now() - start,
      }
    }
  } catch (error) {
    return {
      status: 'unhealthy',
      message: error instanceof Error ? error.message : 'Whisper API unreachable',
      responseTime: Date.now() - start,
    }
  }
}

/**
 * Check Qwen2-Audio API availability
 */
async function checkQwen(): Promise<ServiceHealth> {
  const start = Date.now()
  const qwenUrl = process.env.QWEN_API_URL

  if (!qwenUrl) {
    return {
      status: 'unhealthy',
      message: 'QWEN_API_URL not configured',
    }
  }

  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 5000)

    const response = await fetch(`${qwenUrl}/health`, {
      signal: controller.signal,
    })

    clearTimeout(timeout)

    if (response.ok) {
      return {
        status: 'healthy',
        responseTime: Date.now() - start,
      }
    } else {
      return {
        status: 'degraded',
        message: `Qwen API returned status ${response.status}`,
        responseTime: Date.now() - start,
      }
    }
  } catch (error) {
    return {
      status: 'unhealthy',
      message: error instanceof Error ? error.message : 'Qwen API unreachable',
      responseTime: Date.now() - start,
    }
  }
}

/**
 * Detailed health check endpoint
 * Checks all critical services: database, Whisper API, and Qwen API
 */
export async function GET() {
  const startTime = Date.now()

  // Check all services in parallel
  const [database, whisper, qwen] = await Promise.all([
    checkDatabase(),
    checkWhisper(),
    checkQwen(),
  ])

  // Determine overall health status
  let overallStatus: 'healthy' | 'unhealthy' | 'degraded' = 'healthy'

  if (
    database.status === 'unhealthy' ||
    whisper.status === 'unhealthy' ||
    qwen.status === 'unhealthy'
  ) {
    overallStatus = 'unhealthy'
  } else if (
    database.status === 'degraded' ||
    whisper.status === 'degraded' ||
    qwen.status === 'degraded'
  ) {
    overallStatus = 'degraded'
  }

  const response: DetailedHealthResponse = {
    status: overallStatus,
    timestamp: new Date().toISOString(),
    services: {
      database,
      whisper,
      qwen,
    },
    uptime: process.uptime(),
  }

  // Return appropriate HTTP status code
  const statusCode = overallStatus === 'healthy' ? 200 : overallStatus === 'degraded' ? 200 : 503

  return NextResponse.json(response, { status: statusCode })
}
